import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileEdit,
  FileSpreadsheet,
  FileText,
  FolderTree,
  LayoutDashboard,
  Package,
  Percent,
  Rss,
  Settings,
  ShoppingCart,
  Star,
  Trash2,
  Upload,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink } from "react-router-dom"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { useStore } from "../../state/storeContext"

const navItems: Array<{
  path: string | null
  icon: any
  key: string
  dynamic?: boolean
}> = [
  { path: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { path: "/single", icon: Package, key: "single" },
  { path: "/update-prices", icon: DollarSign, key: "updatePrices" },
  { path: "/bulk-fields", icon: FileText, key: "bulkFields" },
  { path: "/delete", icon: Trash2, key: "delete" },
  { path: "/import-csv", icon: Upload, key: "importCsv" },
  { path: "/csv-generator", icon: FileSpreadsheet, key: "csvGenerator" },
  { path: "/categories", icon: FolderTree, key: "categories" },
  { path: "/reviews", icon: Star, key: "reviews" },
  { path: "/offers/fbt", icon: ShoppingCart, key: "upsellCombos" },
  { path: "/offers/bmsm", icon: Percent, key: "bmsmRules" },
  { path: null, icon: FileEdit, key: "descriptionBuilder", dynamic: true }, // Dynamic path based on storeId
  { path: "/feeds", icon: Rss, key: "feeds" },
  { path: "/jobs", icon: Briefcase, key: "jobs" },
  { path: "/settings", icon: Settings, key: "settings" },
]

export function SidebarNav() {
  const { t } = useTranslation()
  const { selectedStoreId } = useStore()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-card border-r transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="p-4 border-b flex items-center justify-between">
        {!collapsed && (
          <h2 className="font-bold text-lg">WooCommerce Manager</h2>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const path = item.dynamic
            ? selectedStoreId
              ? `/stores/${selectedStoreId}/description-builder`
              : null
            : item.path

          if (!path) {
            return (
              <div
                key={item.key}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground opacity-50 cursor-not-allowed",
                  collapsed && "justify-center"
                )}
                title={collapsed ? t(`nav.${item.key}`) : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{t(`nav.${item.key}`)}</span>}
              </div>
            )
          }

          return (
            <NavLink
              key={item.key}
              to={path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  collapsed && "justify-center"
                )
              }
              title={collapsed ? t(`nav.${item.key}`) : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{t(`nav.${item.key}`)}</span>}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}

