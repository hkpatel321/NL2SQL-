import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Database, Table, ChevronDown, ChevronRight, RefreshCw, Columns } from 'lucide-react';
import './SchemaExplorer.css';

const SchemaExplorer = ({ selectedDatabase, onDatabaseChange }) => {
    const [databases, setDatabases] = useState([]);
    const [schema, setSchema] = useState({});
    const [expandedTables, setExpandedTables] = useState({});
    const [loading, setLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Fetch databases on mount and refresh
    useEffect(() => {
        let cancelled = false;
        
        axios.get('http://localhost:5000/api/databases')
            .then(response => {
                if (!cancelled) {
                    setDatabases(response.data.databases || []);
                }
            })
            .catch(error => {
                console.error('Failed to fetch databases:', error);
            });
        
        return () => { cancelled = true; };
    }, [refreshTrigger]);

    // Fetch schema when database changes or refresh triggered
    useEffect(() => {
        if (!selectedDatabase) return;
        
        let cancelled = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        
        axios.get(`http://localhost:5000/api/schema/${selectedDatabase}`)
            .then(response => {
                if (!cancelled) {
                    setSchema(response.data.schema || {});
                    setLoading(false);
                }
            })
            .catch(error => {
                console.error('Failed to fetch schema:', error);
                if (!cancelled) {
                    setSchema({});
                    setLoading(false);
                }
            });
        
        return () => { cancelled = true; };
    }, [selectedDatabase, refreshTrigger]);

    const toggleTable = (tableName) => {
        setExpandedTables(prev => ({
            ...prev,
            [tableName]: !prev[tableName]
        }));
    };

    const refreshSchema = useCallback(() => {
        setRefreshTrigger(prev => prev + 1);
    }, []);

    return (
        <div className="schema-explorer">
            <div className="schema-header">
                <h3>
                    <Database size={18} />
                    Schema Explorer
                </h3>
                <button className="refresh-btn" onClick={refreshSchema} title="Refresh">
                    <RefreshCw size={16} className={loading ? 'spinning' : ''} />
                </button>
            </div>

            <div className="database-selector">
                <label>Database</label>
                <select 
                    value={selectedDatabase}
                    onChange={(e) => onDatabaseChange(e.target.value)}
                >
                    {databases.map(db => (
                        <option key={db} value={db}>{db}</option>
                    ))}
                </select>
            </div>

            <div className="tables-list">
                {loading ? (
                    <div className="loading-schema">Loading schema...</div>
                ) : Object.keys(schema).length === 0 ? (
                    <div className="no-tables">No tables found</div>
                ) : (
                    Object.entries(schema).map(([tableName, columns]) => (
                        <div key={tableName} className="table-item">
                            <div 
                                className="table-header"
                                onClick={() => toggleTable(tableName)}
                            >
                                {expandedTables[tableName] ? 
                                    <ChevronDown size={16} /> : 
                                    <ChevronRight size={16} />
                                }
                                <Table size={14} />
                                <span className="table-name">{tableName}</span>
                                <span className="column-count">{columns.length}</span>
                            </div>
                            
                            {expandedTables[tableName] && (
                                <div className="columns-list">
                                    {columns.map(col => (
                                        <div key={col.name} className="column-item">
                                            <Columns size={12} />
                                            <span className="column-name">{col.name}</span>
                                            <span className="column-type">{col.type}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default SchemaExplorer;
