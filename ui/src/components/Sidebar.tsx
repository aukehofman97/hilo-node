import React from "react";
import {
  LayoutDashboard,
  Zap,
  Database,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
  { id: "events", label: "Events", icon: <Zap size={20} /> },
  { id: "data-explorer", label: "Data Explorer", icon: <Database size={20} /> },
  { id: "queue", label: "Queue", icon: <MessageSquare size={20} /> },
];

export default function Sidebar({
  activePage,
  onNavigate,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className="fixed top-0 left-0 h-full bg-white border-r border-hilo-gray shadow-hilo flex flex-col transition-all duration-200 z-20"
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-hilo-gray overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-hilo-purple rounded-hilo flex items-center justify-center flex-shrink-0">
            <span className="text-white font-display font-bold text-sm">H</span>
          </div>
          {!collapsed && (
            <span className="font-display font-bold text-hilo-dark text-lg truncate">
              HILO Node
            </span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-hidden">
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 mb-1 transition-colors duration-150 ${
                isActive
                  ? "bg-hilo-purple text-white rounded-hilo mx-2"
                  : "text-hilo-dark/60 hover:bg-hilo-purple-50 hover:text-hilo-dark rounded-hilo mx-2"
              }`}
              style={{ width: collapsed ? 40 : "calc(100% - 16px)" }}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && (
                <span className="font-body font-medium text-sm truncate">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center justify-center h-10 border-t border-hilo-gray text-hilo-dark/40 hover:text-hilo-dark hover:bg-hilo-purple-50 transition-colors duration-150"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
