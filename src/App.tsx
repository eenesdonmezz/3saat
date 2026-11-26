import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import { AuthProvider } from "./lib/auth";
import { backend } from "./lib/backend";
import { DemoBanner } from "./components/ui";
import Home from "./pages/Home";
import Course from "./pages/Course";
import { ForgotPassword, Login, Register } from "./pages/Auth";
import Panel from "./pages/Panel";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
      <HashRouter>
        {backend.demo && <DemoBanner />}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ders" element={<Course />} />
          <Route path="/giris" element={<Login />} />
          <Route path="/kayit" element={<Register />} />
          <Route path="/sifremi-unuttum" element={<ForgotPassword />} />
          <Route path="/panel" element={<Panel />} />
          <Route path="/yonetim" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
