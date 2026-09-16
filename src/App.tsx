import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AccessGate } from "@/components/AccessGate";
import { AppShell } from "@/components/AppShell";
import ContextWorkspace from "@/pages/ContextWorkspace";
import Decisions from "@/pages/Decisions";
import FocusedWork from "@/pages/FocusedWork";
import KnowledgeBase from "@/pages/KnowledgeBase";

export default function App() {
  return (
    <AccessGate>
      <Router>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ContextWorkspace />} />
            <Route path="/focused" element={<FocusedWork />} />
            <Route path="/decisions" element={<Decisions />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
          </Route>
        </Routes>
      </Router>
    </AccessGate>
  );
}
