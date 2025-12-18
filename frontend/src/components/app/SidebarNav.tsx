import { NavLink } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  LayoutDashboard,
  Package,
  DollarSign,
  FileText,
  Trash2,
  Upload,
  FolderTree,
  Star,
  Briefcase,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { useState } from "react"

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { path: "/single", icon: Package, key: "single" },
  { path: "/update-prices", icon: DollarSign, key: "updatePrices" },
  { path: "/bulk-fields", icon: FileText, key: "bulkFields" },
  { path: "/delete", icon: Trash2, key: "delete" },
  { path: "/import-csv", icon: Upload, key: "importCsv" },
  { path: "/categories", icon: FolderTree, key: "categories" },
  { path: "/reviews", icon: Star, key: "reviews" },
  { path: "/jobs", icon: Briefcase, key: "jobs" },
  { path: "/settings", icon: Settings, key: "settings" },
]

export function SidebarNav() {
  const { t } = useTranslation()
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
          return (
            <NavLink
              key={item.path}
              to={item.path}
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

