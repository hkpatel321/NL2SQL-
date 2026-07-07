"""
Database Manager for Text-to-SQL Application
Handles dynamic database creation from user uploads
"""

import os
import re
import pandas as pd
from sqlalchemy import create_engine, text, inspect
import pymysql
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
import uuid

load_dotenv()

# Database connection details
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")


def get_connection():
    """Get a connection to MySQL server (no database selected)."""
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        port=int(DB_PORT),
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )


def sanitize_name(name: str) -> str:
    """Sanitize a name to be safe for SQL identifiers."""
    # Remove file extension
    name = os.path.splitext(name)[0]
    # Replace spaces and special chars with underscores
    name = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    # Ensure it starts with a letter
    if name and not name[0].isalpha():
        name = 'tbl_' + name
    # Limit length
    return name[:64].lower()


def create_database(db_name: str) -> bool:
    """Create a database if it doesn't exist."""
    try:
        connection = get_connection()
        with connection.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}`")
        connection.close()
        return True
    except Exception as e:
        print(f"Error creating database: {e}")
        return False


def list_databases() -> List[str]:
    """List all user-created databases."""
    try:
        connection = get_connection()
        with connection.cursor() as cursor:
            cursor.execute("SHOW DATABASES")
            result = cursor.fetchall()
        connection.close()
        
        # Filter out system databases
        system_dbs = {'information_schema', 'mysql', 'performance_schema', 'sys'}
        return [db['Database'] for db in result if db['Database'] not in system_dbs]
    except Exception as e:
        print(f"Error listing databases: {e}")
        return []


def get_database_schema(db_name: str) -> Dict[str, List[Dict[str, str]]]:
    """Get schema information for all tables in a database."""
    try:
        connection_string = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{db_name}"
        engine = create_engine(connection_string)
        inspector = inspect(engine)
        
        schema = {}
        for table_name in inspector.get_table_names():
            columns = []
            for column in inspector.get_columns(table_name):
                columns.append({
                    'name': column['name'],
                    'type': str(column['type'])
                })
            schema[table_name] = columns
        
        engine.dispose()
        return schema
    except Exception as e:
        print(f"Error getting schema: {e}")
        return {}


def upload_file_to_database(file_path: str, db_name: str, table_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Upload a CSV or Excel file to create/replace a table in the database.
    
    Returns:
        Dict with status, table_name, row_count, columns
    """
    try:
        # Read the file
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif file_path.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(file_path)
        else:
            return {'success': False, 'error': 'Unsupported file format. Use CSV or Excel.'}
        
        # Generate table name if not provided
        if not table_name:
            table_name = sanitize_name(os.path.basename(file_path))
        else:
            table_name = sanitize_name(table_name)
        
        # Sanitize column names
        df.columns = [sanitize_name(col) for col in df.columns]
        
        # Ensure database exists
        create_database(db_name)
        
        # Create engine and upload
        connection_string = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{db_name}"
        engine = create_engine(connection_string)
        
        df.to_sql(name=table_name, con=engine, if_exists='replace', index=False)
        
        engine.dispose()
        
        return {
            'success': True,
            'table_name': table_name,
            'row_count': len(df),
            'columns': list(df.columns),
            'database': db_name
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def execute_query(db_name: str, query: str, limit: int = 100) -> Dict[str, Any]:
    """
    Execute a SELECT query and return results.
    Only allows SELECT queries for security.
    """
    # Security check - only allow SELECT
    query_upper = query.strip().upper()
    if not query_upper.startswith('SELECT'):
        return {
            'success': False,
            'error': 'Only SELECT queries are allowed for security reasons.'
        }
    
    # Check for dangerous keywords
    dangerous = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE']
    for keyword in dangerous:
        if keyword in query_upper:
            return {
                'success': False,
                'error': f'Query contains forbidden keyword: {keyword}'
            }
    
    try:
        connection_string = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{db_name}"
        engine = create_engine(connection_string)
        
        # Add LIMIT if not present
        if 'LIMIT' not in query_upper:
            query = f"{query.rstrip(';')} LIMIT {limit}"
        
        # Execute query
        with engine.connect() as conn:
            result = conn.execute(text(query))
            rows = result.fetchall()
            columns = list(result.keys())
        
        engine.dispose()
        
        # Convert to list of dicts
        data = [dict(zip(columns, row)) for row in rows]
        
        return {
            'success': True,
            'data': data,
            'columns': columns,
            'row_count': len(data)
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def delete_database(db_name: str) -> bool:
    """Delete a database. Use with caution!"""
    # Prevent deleting system databases
    system_dbs = {'information_schema', 'mysql', 'performance_schema', 'sys'}
    if db_name.lower() in system_dbs:
        return False
    
    try:
        connection = get_connection()
        with connection.cursor() as cursor:
            cursor.execute(f"DROP DATABASE IF EXISTS `{db_name}`")
        connection.close()
        return True
    except Exception as e:
        print(f"Error deleting database: {e}")
        return False
