import { Link, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, UtensilsCrossed, ClipboardList, Flame, FileEdit, History, Bike } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const navItems = [
  { path: '/', labelKey: 'layout.nav.dashboard', icon: LayoutDashboard },
  { path: '/sabores', labelKey: 'layout.nav.flavors', icon: UtensilsCrossed },
  { path: '/pedidos', labelKey: 'layout.nav.orders', icon: ClipboardList },
  { path: '/fritagem', labelKey: 'layout.nav.frying', icon: Flame },
  { path: '/entregador', labelKey: 'layout.nav.delivery', icon: Bike },
  { path: '/edicao', labelKey: 'layout.nav.editing', icon: FileEdit },
  { path: '/historico', labelKey: 'layout.nav.history', icon: History },
];

export default function Layout() {
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const changeLanguage = (language) => {
    i18n.changeLanguage(language);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-nunito">
      {/* Header */}
      <header className="bg-primary shadow-lg sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center min-w-0">
            <span className="text-3xl mr-2">🥟</span>
            <span className="text-primary-foreground font-black text-xl tracking-tight">{t('app.title')}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-primary-foreground/80 text-xs font-bold uppercase tracking-wide hidden sm:inline">
              {t('layout.languageLabel')}
            </span>
            {['pt-BR', 'en-US'].map((language) => {
              const isActive = i18n.resolvedLanguage === language;
              return (
                <button
                  key={language}
                  type="button"
                  onClick={() => changeLanguage(language)}
                  className={`rounded-full border px-3 py-1 text-xs font-black transition-colors ${
                    isActive
                      ? 'border-primary-foreground bg-primary-foreground text-primary'
                      : 'border-primary-foreground/30 text-primary-foreground/80 hover:border-primary-foreground/60 hover:text-primary-foreground'
                  }`}
                >
                  {t(`language.${language}`)}
                </button>
              );
            })}
          </div>
        </div>
        {/* Nav */}
        <nav className="bg-primary/90 border-t border-primary-foreground/20">
          <div className="max-w-5xl mx-auto px-1 flex overflow-x-auto">
            {navItems.map(({ path, labelKey, icon: Icon }) => {
              const active = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  className={`min-w-[88px] flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-bold transition-all ${
                    active
                      ? 'text-primary-foreground border-b-2 border-primary-foreground'
                      : 'text-primary-foreground/60 hover:text-primary-foreground/90'
                  }`}
                >
                  <Icon size={16} />
                  <span className="leading-tight">{t(labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}