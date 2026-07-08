import { useBrands } from '@/hooks/useBrands';
import MenuPackagesPage from '@/pages/MenuPackages';

export default function MenuPackagesRoute() {
  const { brands, loading } = useBrands();

  return <MenuPackagesPage brands={brands} brandsLoading={loading} />;
}