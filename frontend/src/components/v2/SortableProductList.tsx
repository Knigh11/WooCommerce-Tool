// V2 SortableProductList - Drag-drop reorderable product list

import { X } from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "../ui/button"
import { ProductCard } from "../../api/v2/types"

interface SortableProductListProps {
  items: number[]  // Product IDs
  cards: ProductCard[]  // Product cards (map by ID)
  onReorder: (newOrder: number[]) => void
  onRemove: (productId: number) => void
  label?: string
}

function SortableItem({
  productId,
  card,
  onRemove,
}: {
  productId: number
  card: ProductCard | undefined
  onRemove: (id: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: productId.toString() })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-2 border rounded-md bg-background"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground"
      >
        ⋮⋮
      </div>
      {card?.image_url ? (
        <img
          src={card.image_url}
          alt={card.title}
          className="w-10 h-10 object-cover rounded"
        />
      ) : (
        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No Image</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {card?.title || `Product #${productId}`}
        </div>
        <div className="text-sm text-muted-foreground">
          ID: {productId} {card?.sku && `| SKU: ${card.sku}`}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onRemove(productId)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function SortableProductList({
  items,
  cards,
  onReorder,
  onRemove,
  label,
}: SortableProductListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const cardsMap = new Map(cards.map((c) => [c.id, c]))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = items.indexOf(Number(active.id))
      const newIndex = items.indexOf(Number(over.id))
      const newOrder = arrayMove(items, oldIndex, newIndex)
      onReorder(newOrder)
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        {label || "No products"} - Click "Add Product" to add items
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {label && <div className="text-sm font-medium">{label}</div>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map(String)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {items.map((productId) => (
              <SortableItem
                key={productId}
                productId={productId}
                card={cardsMap.get(productId)}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

