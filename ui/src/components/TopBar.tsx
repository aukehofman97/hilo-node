import React, { useState } from "react";
import {
  LayoutDashboard,
  Zap,
  Database,
  MessageSquare,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import hiloLogoColored from "../assets/hilo-logo-colored.png";
import hiloLogoNegative from "../assets/hilo-logo-negative.png";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface TopBarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
  { id: "events", label: "Events", icon: <Zap size={16} /> },
  { id: "data-explorer", label: "Data Explorer", icon: <Database size={16} /> },
  { id: "queue", label: "Queue", icon: <MessageSquare size={16} /> },
];

export default function TopBar({ activePage, onNavigate }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavigate = (id: string) => {
    onNavigate(id);
    setMenuOpen(false);
  };

  return (
    <>
      {/* Main bar */}
      <header className="glass-bar fixed top-0 left-0 right-0 z-30 h-16">
        <div className="h-full max-w-screen-xl mx-auto px-4 md:px-6 flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <img
              src={hiloLogoColored}
              alt="HILO"
              className="h-6 w-auto dark:hidden"
            />
            <img
              src={hiloLogoNegative}
              alt="HILO"
              className="h-6 w-auto hidden dark:block"
            />
            <span className="font-display font-semibold text-[var(--text-muted)] text-[13px] tracking-widest uppercase hidden sm:block">
              Node
            </span>
          </div>

          {/* Desktop nav — center */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-hilo-purple text-white shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-hilo-purple-50 dark:hover:bg-white/8"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Node status */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950/40 border border-green-200/60 dark:border-green-800/40">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="text-xs font-medium text-green-700 dark:text-green-400">node-a</span>
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="w-9 h-9 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-hilo-purple-50 dark:hover:bg-white/8 transition-all duration-200"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-hilo-purple-50 dark:hover:bg-white/8 transition-all duration-200"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile slide-down menu */}
      {menuOpen && (
        <div
          className="fixed top-16 left-0 right-0 z-20 glass-bar border-t border-[var(--border)] animate-slide-down md:hidden"
          role="navigation"
          aria-label="Mobile navigation"
        >
          <nav className="flex flex-col px-4 py-3 gap-1">
            {navItems.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-hilo text-sm font-medium transition-all duration-150 text-left ${
                    isActive
                      ? "bg-hilo-purple text-white"
                      : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-hilo-purple-50 dark:hover:bg-white/8"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
