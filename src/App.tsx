import { AppProvider } from './context/AppContext';
import { ChatContainer } from './components/Chat/ChatContainer';
import './index.css';

function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-[#e5ddd5] flex items-center justify-center">
        <div className="w-full h-screen bg-[#e5ddd5] overflow-hidden flex flex-col">
          <ChatContainer />
        </div>
      </div>
    </AppProvider>
  );
}

export default App;
