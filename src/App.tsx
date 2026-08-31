// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ChatContainer } from './components/Chat/ChatContainer';
import { AdminPanel } from './pages/AdminPanel';
import './index.css';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <div className="h-dvh w-full bg-[#e5ddd5] overflow-hidden">
                <ChatContainer />
              </div>
            }
          />
          <Route path="/admin" element={<AdminPanel />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;