git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-RaMzMY2Y' (errno=Operation not permitted)
git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-ehzNqKkZ' (errno=Operation not permitted)
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

export { Skeleton }
