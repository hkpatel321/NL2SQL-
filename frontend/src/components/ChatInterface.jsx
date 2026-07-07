import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, Loader2, Database, Play, Upload } from 'lucide-react';
import ResultsTable from './ResultsTable';
import './ChatInterface.css';

const ChatInterface = ({ selectedDatabase, onOpenUpload }) => {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: "Hello! I'm your SQL Assistant. Select a database from the sidebar and ask me anything about your data. You can also upload your own datasets!" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [executingQuery, setExecutingQuery] = useState(null);
    const messagesEndRef = useRef(null);

    // Debounce timer for rate limiting
    const [lastRequestTime, setLastRequestTime] = useState(0);
    const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const formatTime = (date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const handleSend = async () => {
        if (!input.trim()) return;
        
        // Rate limiting check
        const now = Date.now();
        if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
            const waitTime = Math.ceil((MIN_REQUEST_INTERVAL - (now - lastRequestTime)) / 1000);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Please wait ${waitTime} second(s) before sending another message.`,
                isError: true,
                timestamp: new Date()
            }]);
            return;
        }
        setLastRequestTime(now);

        const userMessage = { role: 'user', content: input, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await axios.post('http://localhost:5000/api/chat', { 
                query: input,
                database: selectedDatabase
            });

            const botMessage = {
                role: 'assistant',
                content: response.data.response || "I couldn't generate a response.",
                sql_query: response.data.sql_query,
                database: response.data.database,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessageContent = error.response?.data?.error || "Sorry, I encountered an error. Please try again later.";
            const errorMessage = {
                role: 'assistant',
                content: errorMessageContent,
                isError: true,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecuteQuery = async (msgIndex, query, database) => {
        setExecutingQuery(msgIndex);
        
        try {
            const response = await axios.post('http://localhost:5000/api/execute', {
                query: query,
                database: database
            });
            
            if (response.data.success) {
                // Update the message with results
                setMessages(prev => prev.map((msg, idx) => 
                    idx === msgIndex 
                        ? { ...msg, queryResults: response.data }
                        : msg
                ));
            } else {
                setMessages(prev => prev.map((msg, idx) => 
                    idx === msgIndex 
                        ? { ...msg, queryError: response.data.error }
                        : msg
                ));
            }
        } catch (error) {
            setMessages(prev => prev.map((msg, idx) => 
                idx === msgIndex 
                    ? { ...msg, queryError: error.response?.data?.error || 'Failed to execute query' }
                    : msg
            ));
        } finally {
            setExecutingQuery(null);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="chat-container">
            <header className="chat-header">
                <div className="logo-area">
                    <Database className="logo-icon" size={24} />
                    <div className="header-text">
                        <h1>Text-to-SQL Assistant</h1>
                        <span className="current-db">
                            Connected to: <strong>{selectedDatabase}</strong>
                        </span>
                    </div>
                </div>
                <button className="upload-header-btn" onClick={onOpenUpload}>
                    <Upload size={18} />
                    Upload Dataset
                </button>
            </header>

            <div className="messages-area">
                {messages.map((msg, index) => (
                    <div key={index} className={`message-row ${msg.role === 'user' ? 'user-row' : 'bot-row'}`}>
                        <div className={`message-bubble ${msg.role} ${msg.isError ? 'error' : ''}`}>
                            <div className="message-icon">
                                {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                            </div>
                            <div className="message-content">
                                {msg.role === 'assistant' ? (
                                    <>
                                        {msg.sql_query && (
                                            <div className="sql-query-container">
                                                <div className="sql-query-header">
                                                    <span>Generated SQL:</span>
                                                    <button 
                                                        className="execute-btn"
                                                        onClick={() => handleExecuteQuery(index, msg.sql_query, msg.database || selectedDatabase)}
                                                        disabled={executingQuery === index}
                                                    >
                                                        {executingQuery === index ? (
                                                            <><Loader2 className="spin" size={14} /> Executing...</>
                                                        ) : (
                                                            <><Play size={14} /> Execute Query</>
                                                        )}
                                                    </button>
                                                </div>
                                                <pre className="sql-query-code">
                                                    <code>{msg.sql_query}</code>
                                                </pre>
                                            </div>
                                        )}
                                        
                                        {msg.queryError && (
                                            <div className="query-error">
                                                ⚠️ {msg.queryError}
                                            </div>
                                        )}
                                        
                                        {msg.queryResults && (
                                            <ResultsTable 
                                                data={msg.queryResults.data}
                                                columns={msg.queryResults.columns}
                                            />
                                        )}
                                        
                                        <ReactMarkdown>
                                            {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                                        </ReactMarkdown>
                                    </>
                                ) : (
                                    <p>{msg.content}</p>
                                )}
                            </div>
                            {msg.timestamp && <span className="timestamp">{formatTime(msg.timestamp)}</span>}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="message-row bot-row">
                        <div className="message-bubble assistant loading">
                            <Bot size={18} />
                            <div className="typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
                <div className="input-wrapper">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`Ask about your ${selectedDatabase} data...`}
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="send-button"
                    >
                        {isLoading ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatInterface;
