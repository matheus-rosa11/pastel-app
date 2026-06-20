import { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import Sabores from './pages/Sabores';
import Pedidos from './pages/Pedidos';
import Reservas from './pages/Reservas';
import Fritagem from './pages/Fritagem';
import EdicaoPedido from './pages/EdicaoPedido';
import Historico from './pages/Historico';
import Entregador from './pages/Entregador';
import { useRealtimeSync } from './hooks/useRealtimeSync';

const Dashboard = lazy(() => import('./pages/Dashboard'));

function AppLoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
    </div>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  useRealtimeSync();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppLoadingScreen />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/pedidos" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/sabores" element={<Sabores />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/reservas" element={<Reservas />} />
          <Route path="/fritagem" element={<Fritagem />} />
          <Route path="/entregador" element={<Entregador />} />
          <Route path="/edicao" element={<EdicaoPedido />} />
          <Route path="/historico" element={<Historico />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;