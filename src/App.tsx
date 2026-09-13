import React from 'react';

import { Toaster } from '@/components/ui/sonner';

import { TooltipProvider } from './components/ui/tooltip';
import { useTheme } from './hooks/useTheme';
import Home from './pages/home';

function App() {
  useTheme();

  return (
    <div className="min-h-screen bg-background">
      <TooltipProvider>
        <Toaster position="bottom-right" />
        <Home />
      </TooltipProvider>
    </div>
  );
}

export default App;
