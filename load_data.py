import os
import pandas as pd
from sqlalchemy import create_engine
import pymysql
from dotenv import load_dotenv

load_dotenv()

# Database connection details
# You can change these or set environment variables
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = "regional_sales_data"

# Directory containing the CSV files
DATA_DIR = r"Data_CSV-20251208T122252Z-3-001/Data_CSV"

def create_database():
    """Create the database if it doesn't exist."""
    print(f"Connecting to MySQL at {DB_HOST}:{DB_PORT} as {DB_USER}...")
    try:
        # Connect to MySQL server (no database selected yet)
        connection = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            port=int(DB_PORT),
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor
        )
        
        with connection.cursor() as cursor:
            print(f"Creating database '{DB_NAME}' if it doesn't exist...")
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
            print(f"Database '{DB_NAME}' ready.")
            
        connection.close()
    except Exception as e:
        print(f"Error creating database: {e}")
        return False
    return True

def load_data():
    """Load CSV files into the database."""
    
    # Create SQLAlchemy engine
    connection_string = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(connection_string)
    
    # Map CSV filenames to Table names
    # Adjust based on your actual CSV filenames and desired table names
    files_to_tables = {
        "2017_Budgets.csv": "2017_budgets",
        "Customers.csv": "customers",
        "Products.csv": "products",
        "Regions.csv": "regions",
        "sales_order.csv": "sales_order",
        "State_Regions.csv": "state_regions"
    }
    
    for filename, table_name in files_to_tables.items():
        file_path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(file_path):
            print(f"Warning: File not found: {file_path}")
            continue
            
        print(f"Loading {filename} into table '{table_name}'...")
        try:
            # Read CSV
            df = pd.read_csv(file_path)
            
            # Write to SQL (replace if exists)
            df.to_sql(name=table_name, con=engine, if_exists='replace', index=False)
            print(f"Successfully loaded {len(df)} rows into '{table_name}'.")
        except Exception as e:
            print(f"Error loading {filename}: {e}")

if __name__ == "__main__":
    if create_database():
        load_data()
        print("Data loading complete.")
