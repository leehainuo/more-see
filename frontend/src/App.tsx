import { BrowserRouter, Route, Routes } from "react-router-dom";

import History from "@/pages/History";
import Home from "@/pages/Home";
import Settings from "@/pages/Settings";
import Workspace from "@/pages/Workspace";

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
