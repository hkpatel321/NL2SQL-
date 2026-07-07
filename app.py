import os
import time
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from functools import wraps

# LangChain imports
from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent  # Keep this, the warning might be about internal usage or I can try langchain.agents

# Local imports
import database_manager as db_manager

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Database Configuration
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DEFAULT_DB_NAME = "regional_sales_data"

# OpenRouter Configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY environment variable not set")

# Cache for database connections
db_cache = {}


def get_mysql_uri(db_name: str) -> str:
    """Build MySQL URI for a given database."""
    return f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{db_name}"


def retry_with_backoff(max_retries: int = 3, base_delay: float = 2.0):
    """
    Decorator for retry with exponential backoff.
    Handles rate limit (429) errors.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    error_str = str(e)
                    # Check if it's a rate limit error
                    if "429" in error_str or "rate" in error_str.lower() or "limit" in error_str.lower():
                        last_exception = e
                        delay = base_delay * (2 ** attempt)  # Exponential backoff
                        print(f"Rate limit hit. Retrying in {delay}s... (attempt {attempt + 1}/{max_retries})")
                        time.sleep(delay)
                    else:
                        # Not a rate limit error, re-raise immediately
                        raise
            # All retries exhausted
            raise last_exception
        return wrapper
    return decorator


def get_agent(db_name: str):
    """Get or create an agent for the specified database."""
    global db_cache
    
    mysql_uri = get_mysql_uri(db_name)
    
    # Create or get cached database
    if db_name not in db_cache:
        try:
            db_cache[db_name] = SQLDatabase.from_uri(mysql_uri)
            print(f"Connected to database '{db_name}' successfully.")
        except Exception as e:
            print(f"Error connecting to database: {e}")
            raise e
    
    db = db_cache[db_name]
    
    # Initialize LLM using OpenRouter (OpenAI-compatible API)
    # Using Xiaomi MiMo-V2-Flash (FREE model!)
    llm = ChatOpenAI(
        model="xiaomi/mimo-v2-flash:free",
        openai_api_key=OPENROUTER_API_KEY,
        openai_api_base="https://openrouter.ai/api/v1",
        max_retries=3,
        default_headers={
            "HTTP-Referer": "http://localhost:5000",  # Required by OpenRouter
            "X-Title": "Text-to-SQL Assistant"  # Optional, for OpenRouter dashboard
        }
    )
    
    # Initialize Toolkit
    toolkit = SQLDatabaseToolkit(db=db, llm=llm)
    
    # System prompt
    system_message = """You are an agent designed to interact with a SQL database.
Given an input question, create a syntactically correct {dialect} query to run, then look at the results of the query and return the answer.
Unless the user specifies a specific number of examples they wish to obtain, always limit your query to at most {top_k} results.
You can order the results by a relevant column to return the most interesting examples in the database.
Never query for all the columns from a specific table, only ask for the relevant columns given the question.
You have access to tools for interacting with the database.
Only use the below tools. Only use the information returned by the below tools to construct your final answer.
You MUST double check your query before executing it. If you get an error while executing a query, rewrite the query and try again.

DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.) to the database.

If the question does not seem related to the database, just return "I don't know" as the answer.
""".format(dialect="mysql", top_k=5)
    
    # Create Agent
    agent_executor = create_react_agent(llm, toolkit.get_tools(), prompt=system_message)
    return agent_executor


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "Text-to-SQL Backend", "model": "Claude Sonnet via OpenRouter"})


@app.route('/api/databases', methods=['GET'])
def list_databases():
    """List all available databases."""
    databases = db_manager.list_databases()
    return jsonify({"databases": databases})


@app.route('/api/schema/<db_name>', methods=['GET'])
def get_schema(db_name: str):
    """Get schema for a specific database."""
    schema = db_manager.get_database_schema(db_name)
    return jsonify({"database": db_name, "schema": schema})


@app.route('/api/upload', methods=['POST'])
def upload_dataset():
    """Upload CSV/Excel file to create a new table."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    # Get database name from form or use default
    db_name = request.form.get('database', 'user_data')
    table_name = request.form.get('table_name', None)
    
    # Save file temporarily
    try:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name
        
        # Upload to database
        result = db_manager.upload_file_to_database(tmp_path, db_name, table_name)
        
        # Clean up temp file
        os.unlink(tmp_path)
        
        # Clear cache for this database to refresh schema
        if db_name in db_cache:
            del db_cache[db_name]
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/execute', methods=['POST'])
def execute_sql():
    """Execute a SQL query and return results."""
    data = request.json
    query = data.get('query')
    db_name = data.get('database', DEFAULT_DB_NAME)
    
    if not query:
        return jsonify({"error": "No query provided"}), 400
    
    result = db_manager.execute_query(db_name, query)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 400


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_query = data.get('query')
    db_name = data.get('database', DEFAULT_DB_NAME)
    
    if not user_query:
        return jsonify({"error": "No query provided"}), 400
    
    @retry_with_backoff(max_retries=3, base_delay=2.0)
    def invoke_agent():
        agent = get_agent(db_name)
        return agent.invoke({"messages": [("user", user_query)]})
    
    try:
        response = invoke_agent()
        
        # Extract the final answer from the messages
        messages = response["messages"]
        ai_message = messages[-1]
        content = ai_message.content
        
        # Handle case where content is a list of blocks
        if isinstance(content, list):
            text_parts = []
            for block in content:
                if isinstance(block, dict) and 'text' in block:
                    text_parts.append(block['text'])
                elif isinstance(block, str):
                    text_parts.append(block)
            response_text = " ".join(text_parts)
        else:
            response_text = str(content)

        # Extract the SQL query from the tool calls
        sql_query = None
        for message in messages:
            if hasattr(message, 'tool_calls') and message.tool_calls:
                for tool_call in message.tool_calls:
                    if tool_call['name'] == 'sql_db_query':
                        sql_query = tool_call['args'].get('query')
        
        return jsonify({
            "response": response_text,
            "sql_query": sql_query,
            "database": db_name
        })
        
    except Exception as e:
        import traceback
        error_msg = str(e)
        trace = traceback.format_exc()
        
        # Check for rate limit errors
        if "429" in error_msg or "rate" in error_msg.lower():
            print(f"Rate limit exceeded after retries: {error_msg}")
            return jsonify({
                "error": "The AI model is currently overloaded. Please wait a minute and try again."
            }), 429

        print(f"Error processing query: {error_msg}")
        print(trace)
        return jsonify({"error": error_msg}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
