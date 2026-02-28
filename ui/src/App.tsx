import React, { useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import TopBar from "./components/TopBar";
import Dashboard from "./pages/Dashboard";
import Events from "./pages/Events";
import DataExplorer from "./pages/DataExplorer";
import Queue from "./pages/Queue";

type Page = "dashboard" | "events" | "data-explorer" | "queue";

function AppShell() {
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const navigate = (page: string) => setActivePage(page as Page);

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <Dashboard onNavigate={navigate} />;
      case "events":
        return <Events onNavigate={navigate} />;
      case "data-explorer":
        return <DataExplorer />;
      case "queue":
        return <Queue />;
    }
  };

  return (
    <div className="min-h-screen mesh-bg">
      <TopBar activePage={activePage} onNavigate={navigate} />
      <main className="pt-16">
        <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
