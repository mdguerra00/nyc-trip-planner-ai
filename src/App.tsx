import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Auth from "./pages/Auth";
import Calendar from "./pages/Calendar";
import ProgramList from "./pages/ProgramList";
import ProgramDetail from "./pages/ProgramDetail";
import TravelProfile from "./pages/TravelProfile";
import NotFound from "./pages/NotFound";
import { BottomNav } from "./components/BottomNav";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
          <Route path="/list" element={<ProtectedRoute><ProgramList /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><TravelProfile /></ProtectedRoute>} />
          <Route path="/program/:id" element={<ProtectedRoute><ProgramDetail /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <BottomNav />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
