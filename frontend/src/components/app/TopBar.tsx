import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useStore } from "../../state/storeContext"
import { useStores } from "../../hooks/useStores"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { ThemeToggle } from "../ui/theme-toggle"
import { Button } from "../ui/button"
import { Globe, Briefcase } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { useJobManager } from "../../state/jobManager"
import { useState } from "react"
import { extractSlugFromUrl, parseProductIds } from "../../api/client"
import { JobCenter } from "../JobCenter"

export function TopBar() {
  const { t, i18n } = useTranslation()
  const { selectedStoreId, setSelectedStoreId, stores } = useStore()
  const navigate = useNavigate()
  const { openDrawer, activeJobIds } = useJobManager()
  const [quickJumpValue, setQuickJumpValue] = useState("")
  useStores() // Ensure stores are loaded

  const handleQuickJump = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && quickJumpValue.trim()) {
      const value = quickJumpValue.trim()
      
      // Check if it's a URL
      const slug = extractSlugFromUrl(value)
      if (slug) {
        navigate(`/single?url=${encodeURIComponent(value)}`)
        setQuickJumpValue("")
        return
      }
      
      // Check if it's a numeric ID
      const ids = parseProductIds(value)
      if (ids.length > 0) {
        navigate(`/single?id=${ids[0]}`)
        setQuickJumpValue("")
        return
      }
    }
  }

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang)
  }

  return (
    <div className="h-16 border-b bg-background flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-4 flex-1">
        {/* Store Selector */}
        <div className="flex items-center gap-2">
          <Label htmlFor="store-select" className="whitespace-nowrap">
            {t("forms.storeSelector.label")}:
          </Label>
          <Select
            value={selectedStoreId || ""}
            onValueChange={(value) => setSelectedStoreId(value || null)}
          >
            <SelectTrigger id="store-select" className="w-[300px]">
              <SelectValue placeholder={t("forms.storeSelector.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name} ({store.store_url})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quick Jump */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Label htmlFor="quick-jump" className="whitespace-nowrap">
            {t("topBar.quickJump.label")}:
          </Label>
          <Input
            id="quick-jump"
            placeholder={t("topBar.quickJump.placeholder")}
            value={quickJumpValue}
            onChange={(e) => setQuickJumpValue(e.target.value)}
            onKeyDown={handleQuickJump}
            className="flex-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* JobCenter - Job management panel */}
        <JobCenter variant="button" />
        
        {/* Legacy Jobs Drawer Button (optional, can be removed if JobCenter is sufficient) */}
        <Button
          variant="outline"
          onClick={openDrawer}
          className="relative"
        >
          <Briefcase className="h-4 w-4 mr-2" />
          {t("topBar.jobs")}
          {activeJobIds.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {activeJobIds.length}
            </span>
          )}
        </Button>

        {/* Language Toggle */}
        <Select value={i18n.language} onValueChange={changeLanguage}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {i18n.language === "vi"
                  ? t("topBar.language.vi")
                  : t("topBar.language.en")}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t("topBar.language.en")}
              </span>
            </SelectItem>
            <SelectItem value="vi">
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                {t("topBar.language.vi")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Theme Toggle */}
        <ThemeToggle />
      </div>
    </div>
  )
}

