import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { Upload, FileSpreadsheet, Check, AlertCircle, X } from 'lucide-react';
import './DatasetUpload.css';

const DatasetUpload = ({ onUploadSuccess, onClose }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [databaseName, setDatabaseName] = useState('user_data');
    const [tableName, setTableName] = useState('');

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragIn = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragOut = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    }, []);

    const handleFile = (selectedFile) => {
        const validExtensions = ['.csv', '.xlsx', '.xls'];
        
        const hasValidExtension = validExtensions.some(ext => 
            selectedFile.name.toLowerCase().endsWith(ext)
        );
        
        if (!hasValidExtension) {
            setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
            return;
        }
        
        setFile(selectedFile);
        setError(null);
        setResult(null);
        
        // Auto-generate table name from filename
        const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
        setTableName(baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase());
    };

    const handleFileInput = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        
        setUploading(true);
        setError(null);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('database', databaseName);
        if (tableName) {
            formData.append('table_name', tableName);
        }
        
        try {
            const response = await axios.post('http://localhost:5000/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            
            setResult(response.data);
            if (onUploadSuccess) {
                onUploadSuccess(response.data);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const resetUpload = () => {
        setFile(null);
        setResult(null);
        setError(null);
    };

    return (
        <div className="upload-overlay">
            <div className="upload-modal">
                <div className="upload-header">
                    <h2>
                        <FileSpreadsheet size={24} />
                        Upload Your Dataset
                    </h2>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {result ? (
                    <div className="upload-success">
                        <div className="success-icon">
                            <Check size={48} />
                        </div>
                        <h3>Upload Successful!</h3>
                        <div className="success-details">
                            <p><strong>Database:</strong> {result.database}</p>
                            <p><strong>Table:</strong> {result.table_name}</p>
                            <p><strong>Rows:</strong> {result.row_count}</p>
                            <p><strong>Columns:</strong> {result.columns?.join(', ')}</p>
                        </div>
                        <div className="success-actions">
                            <button onClick={resetUpload} className="btn-secondary">
                                Upload Another
                            </button>
                            <button onClick={onClose} className="btn-primary">
                                Start Querying
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div 
                            className={`drop-zone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
                            onDragEnter={handleDragIn}
                            onDragLeave={handleDragOut}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            {file ? (
                                <div className="file-preview">
                                    <FileSpreadsheet size={48} />
                                    <p className="file-name">{file.name}</p>
                                    <p className="file-size">{(file.size / 1024).toFixed(1)} KB</p>
                                    <button onClick={resetUpload} className="remove-file">
                                        <X size={16} /> Remove
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Upload size={48} />
                                    <p>Drag & drop your file here</p>
                                    <span>or</span>
                                    <label className="file-input-label">
                                        Browse Files
                                        <input 
                                            type="file" 
                                            accept=".csv,.xlsx,.xls"
                                            onChange={handleFileInput}
                                            hidden
                                        />
                                    </label>
                                    <p className="file-types">Supports CSV, Excel (.xlsx, .xls)</p>
                                </>
                            )}
                        </div>

                        {file && (
                            <div className="upload-options">
                                <div className="form-group">
                                    <label>Database Name</label>
                                    <input 
                                        type="text"
                                        value={databaseName}
                                        onChange={(e) => setDatabaseName(e.target.value)}
                                        placeholder="user_data"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Table Name</label>
                                    <input 
                                        type="text"
                                        value={tableName}
                                        onChange={(e) => setTableName(e.target.value)}
                                        placeholder="Auto-generated from filename"
                                    />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="upload-error">
                                <AlertCircle size={18} />
                                {error}
                            </div>
                        )}

                        {file && (
                            <button 
                                className="upload-btn"
                                onClick={handleUpload}
                                disabled={uploading}
                            >
                                {uploading ? 'Uploading...' : 'Upload Dataset'}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default DatasetUpload;
