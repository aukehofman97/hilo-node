import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Events from "./pages/Events";
import DataExplorer from "./pages/DataExplorer";
import Queue from "./pages/Queue";

type Page = "dashboard" | "events" | "data-explorer" | "queue";

function renderPage(page: Page) {
  switch (page) {
    case "dashboard":
      return <Dashboard />;
    case "events":
      return <Events />;
    case "data-explorer":
      return <DataExplorer />;
    case "queue":
      return <Queue />;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        activePage={activePage}
        onNavigate={(page) => setActivePage(page as Page)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <main
        className="flex-1 min-h-screen transition-all duration-200"
        style={{ marginLeft: collapsed ? 64 : 240 }}
      >
        <div className="p-8">{renderPage(activePage)}</div>
      </main>
    </div>
  );
}
