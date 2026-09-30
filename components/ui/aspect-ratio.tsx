git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-c8ZGq4JT' (errno=Operation not permitted)
git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-WroOvrk5' (errno=Operation not permitted)
"use client"

import { AspectRatio as AspectRatioPrimitive } from "radix-ui"

function AspectRatio({
  ...props
}: React.ComponentProps<typeof AspectRatioPrimitive.Root>) {
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />
}

export { AspectRatio }
