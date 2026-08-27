import React from 'react';
import { AppProvider } from './context/AppContext';
import { ChatContainer } from './components/Chat/ChatContainer';
import './index.css';

function App() {
  return (
    <AppProvider>
      <div className="min-h-screen w-full bg-[#e5ddd5] flex items-center justify-center">
        <div className="w-full h-screen max-w-full md:max-w-3xl md:h-[90vh] md:rounded-lg md:shadow-xl overflow-hidden flex flex-col">
          <ChatContainer />
        </div>
      </div>
    </AppProvider>
  );
}

export default App;
