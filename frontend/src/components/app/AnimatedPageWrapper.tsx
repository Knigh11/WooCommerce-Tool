import { AnimatePresence, motion } from "framer-motion"
import { ReactNode } from "react"

interface AnimatedPageWrapperProps {
  children: ReactNode
  locationKey: string
}

export function AnimatedPageWrapper({ children, locationKey }: AnimatedPageWrapperProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={locationKey}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

