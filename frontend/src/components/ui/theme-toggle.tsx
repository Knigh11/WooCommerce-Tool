import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()

  return (
    <Select value={theme || "system"} onValueChange={setTheme}>
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder={t("topBar.theme.system")}>
          {theme === "light" && (
            <span className="flex items-center gap-2">
              <Sun className="h-4 w-4" />
              {t("topBar.theme.light")}
            </span>
          )}
          {theme === "dark" && (
            <span className="flex items-center gap-2">
              <Moon className="h-4 w-4" />
              {t("topBar.theme.dark")}
            </span>
          )}
          {theme === "system" && (
            <span className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              {t("topBar.theme.system")}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">
          <span className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            {t("topBar.theme.light")}
          </span>
        </SelectItem>
        <SelectItem value="dark">
          <span className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            {t("topBar.theme.dark")}
          </span>
        </SelectItem>
        <SelectItem value="system">
          <span className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            {t("topBar.theme.system")}
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

