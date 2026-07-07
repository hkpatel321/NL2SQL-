import React, { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import SchemaExplorer from './components/SchemaExplorer';
import DatasetUpload from './components/DatasetUpload';
import './App.css';

function App() {
  const [selectedDatabase, setSelectedDatabase] = useState('regional_sales_data');
  const [showUpload, setShowUpload] = useState(false);

  const handleUploadSuccess = (result) => {
    // Switch to the newly created database
    setSelectedDatabase(result.database);
  };

  return (
    <div className="app">
      <SchemaExplorer 
        selectedDatabase={selectedDatabase}
        onDatabaseChange={setSelectedDatabase}
      />
      <ChatInterface 
        selectedDatabase={selectedDatabase}
        onOpenUpload={() => setShowUpload(true)}
      />
      {showUpload && (
        <DatasetUpload 
          onUploadSuccess={handleUploadSuccess}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}

export default App;
