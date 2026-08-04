import { createRoute, redirect } from '@tanstack/react-router';
import { dashboardRoute } from '@/routes/dashboard';
import { OverviewPage } from '@/components/custom/dashboard/OverviewPage';
import { requireConsoleAuth } from '@/lib/auth';
import { SELF_RESOURCE_SCOPE } from '@/lib/resource-scope';

function DashboardIndexPage() {
  return <OverviewPage scope={SELF_RESOURCE_SCOPE} />;
}

export const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  beforeLoad: async () => {
    const { user } = await requireConsoleAuth();
    if (user.is_admin) {
      throw redirect({ to: '/dashboard/users' });
    }
  },
  component: DashboardIndexPage,
});
