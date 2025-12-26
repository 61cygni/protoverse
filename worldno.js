// World number allocator - manages allocation and recycling of world numbers
// 0 is reserved for the root world, allocator starts from 1
export class WorldNoAllocator {
  constructor() {
    this.nextWorldno = 1;
    this.available = new Set(); // Pool of returned world numbers
  }

  allocate() {
    if (this.available.size > 0) {
      // Reuse a returned world number
      const worldno = Math.min(...this.available);
      this.available.delete(worldno);
      return worldno;
    }
    // Allocate a new world number
    return this.nextWorldno++;
  }

  release(worldno) {
    // Only release non-zero world numbers (0 is reserved for root)
    if (worldno > 0) {
      this.available.add(worldno);
    }
  }
}

// Export a singleton instance
export const worldNoAllocator = new WorldNoAllocator();

