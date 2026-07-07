import React, { useState } from 'react';
import { Download, ChevronLeft, ChevronRight, Table } from 'lucide-react';
import './ResultsTable.css';

const ResultsTable = ({ data, columns }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [sortColumn, setSortColumn] = useState(null);
    const [sortDirection, setSortDirection] = useState('asc');
    const rowsPerPage = 10;

    // Sort data
    const sortedData = [...data].sort((a, b) => {
        if (!sortColumn) return 0;
        
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        const strA = String(aVal).toLowerCase();
        const strB = String(bVal).toLowerCase();
        
        if (sortDirection === 'asc') {
            return strA.localeCompare(strB);
        }
        return strB.localeCompare(strA);
    });

    // Pagination
    const totalPages = Math.ceil(sortedData.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedData = sortedData.slice(startIndex, startIndex + rowsPerPage);

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const exportToCSV = () => {
        const headers = columns.join(',');
        const rows = data.map(row => 
            columns.map(col => {
                const val = row[col];
                // Escape quotes and wrap in quotes if contains comma
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val ?? '';
            }).join(',')
        );
        
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'query_results.csv';
        link.click();
    };

    const formatValue = (value) => {
        if (value === null || value === undefined) {
            return <span className="null-value">NULL</span>;
        }
        if (typeof value === 'number') {
            return value.toLocaleString();
        }
        return String(value);
    };

    return (
        <div className="results-container">
            <div className="results-header">
                <div className="results-title">
                    <Table size={18} />
                    <span>Query Results</span>
                    <span className="row-count">{data.length} rows</span>
                </div>
                <button className="export-btn" onClick={exportToCSV}>
                    <Download size={16} />
                    Export CSV
                </button>
            </div>

            <div className="table-wrapper">
                <table className="results-table">
                    <thead>
                        <tr>
                            {columns.map(col => (
                                <th 
                                    key={col} 
                                    onClick={() => handleSort(col)}
                                    className={sortColumn === col ? 'sorted' : ''}
                                >
                                    {col}
                                    {sortColumn === col && (
                                        <span className="sort-indicator">
                                            {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                                        </span>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((row, idx) => (
                            <tr key={idx}>
                                {columns.map(col => (
                                    <td key={col}>{formatValue(row[col])}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="pagination">
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span>Page {currentPage} of {totalPages}</span>
                    <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ResultsTable;
