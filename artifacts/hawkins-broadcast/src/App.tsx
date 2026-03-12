import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Page Imports
import Home from "@/pages/home";
import Broadcaster from "@/pages/broadcaster";
import Listener from "@/pages/listener";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/broadcast/:id" component={Broadcaster} />
      <Route path="/watch/:id" component={Listener} />
      <Route component={NotFound} />
    </Switch>
  );
}

function GlobalEffects() {
  return (
    <>
      <div className="crt-overlay" />
      <div className="crt-flicker" />
      <div className="vhs-tracking" />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <GlobalEffects />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
