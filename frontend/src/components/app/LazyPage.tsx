import { ReactNode, Suspense } from "react"
import { LoadingState } from "../common/LoadingState"

interface LazyPageProps {
    children: ReactNode
}

export function LazyPage({ children }: LazyPageProps) {
    return <Suspense fallback={<LoadingState />}>{children}</Suspense>
}

