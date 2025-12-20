import { Calendar, List, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  const buttonClasses = (path: string) => 
    `flex flex-col items-center justify-center flex-1 h-full transition-all duration-150 active:scale-95 ${
      isActive(path) ? "text-primary" : "text-muted-foreground"
    }`;
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border lg:hidden z-50 bottom-nav">
      <div className="flex justify-around items-center h-[80px] pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => navigate("/")}
          className={buttonClasses("/")}
        >
          <Calendar className="w-6 h-6" />
          <span className="text-xs mt-1.5 font-medium">Calendário</span>
        </button>
        
        <button
          onClick={() => navigate("/list")}
          className={buttonClasses("/list")}
        >
          <List className="w-6 h-6" />
          <span className="text-xs mt-1.5 font-medium">Lista</span>
        </button>

        <button
          onClick={() => navigate("/profile")}
          className={buttonClasses("/profile")}
        >
          <User className="w-6 h-6" />
          <span className="text-xs mt-1.5 font-medium">Perfil</span>
        </button>
      </div>
    </nav>
  );
}
