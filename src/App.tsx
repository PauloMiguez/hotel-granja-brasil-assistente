import React from 'react';
import { AppProvider } from './context/AppContext';
import { ChatContainer } from './components/Chat/ChatContainer';
import './index.css';

function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-[#e5ddd5] flex items-center justify-center p-4">
        <div className="w-full max-w-3xl h-[90vh] bg-[#e5ddd5] rounded-lg shadow-xl overflow-hidden flex flex-col">
          <ChatContainer />
        </div>
      </div>
    </AppProvider>
  );
}

export default App;
