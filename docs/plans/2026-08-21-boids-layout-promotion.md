# Boids obstacle layout format and promotion

## Stored format

Obstacle layouts are compact JSON with a required numeric `version` and an
`obstacles` array. Version 1 uses named fields so it remains readable and can
accept additive fields without breaking the decoder.

```json
{"version":1,"obstacles":[{"kind":"circle","x":0.25,"y":0.5,"radius":0.04},{"kind":"capsule","x":0.6,"y":0.4,"halfX":0.12,"halfY":-0.08,"radius":0.025}]}
```

Coordinates are independent of the canvas size:

- `x` is divided by world width and `y` by world height.
- `halfX` is divided by world width and `halfY` by world height.
- `radius` is divided by the smaller of world width and height.
- `kind` is either `circle` or `capsule`.
- Coordinate and radius values are in the range 0 to 1. Capsule offsets are
  in the range -1 to 1, and cannot both be zero.
- A layout contains at most 96 obstacles.

Unknown fields are ignored. An unsupported version, invalid JSON, missing
field, out-of-range number or invalid obstacle is rejected before the live
overlay changes. The Layouts popup shows the reason instead of throwing.

The current live overlay is stored at `el:custom-obstacles:boids`. Named slots
are stored together at `el:custom-obstacle-layouts:boids` as records containing
`name` and `layout`. Both use localStorage through `src/app/persistence.ts`.

## Save, export and import

Open **Layouts** over the boids canvas. Enter a name and choose **Save current**.
Select that slot and choose **Export** to place its JSON in the text area and,
when browser permission allows, copy it to the clipboard. To restore exported
JSON, paste it into the same text area and choose **Import and load**. Import
replaces the live overlay and persists it for reload.

## Promote an export to a shipped preset

Use this recipe in `src/sims/boids/kernel.ts`:

1. Export the named slot and copy the complete one-line JSON string.
2. Choose a lower-case preset id, for example `harbour`.
3. Add the id to `OBSTACLE_LAYOUTS`:

   ```ts
   const OBSTACLE_LAYOUTS = [
     "none",
     "breakwaters",
     "rocks",
     "reef",
     "harbour",
     "custom",
   ] as const;
   ```

4. Add the exported string near the obstacle constants. A `String.raw` literal
   means the browser export can be pasted without escaping its quotation marks:

   ```ts
   const HARBOUR_LAYOUT = String.raw`{"version":1,"obstacles":[{"kind":"circle","x":0.25,"y":0.5,"radius":0.04},{"kind":"capsule","x":0.6,"y":0.4,"halfX":0.12,"halfY":-0.08,"radius":0.025}]}`;
   ```

5. In `createObstacles`, after the early return for `none`, `custom` and an
   empty world, decode the fixed layout:

   ```ts
   if (layout === "harbour") {
     const decoded = decodeObstacleLayout(
       HARBOUR_LAYOUT,
       this.width,
       this.height,
     );
     return decoded.ok ? decoded.obstacles : [];
   }
   ```

6. Add `harbour` to the expected obstacle-layout options in
   `src/sims/boids/kernel.test.cjs`. Add a test that initialises two kernels at
   the same size with `obstacleLayout: "harbour"`, confirms both obstacle arrays
   match, and confirms the array is non-empty.
7. Run `npm run verify`, then select **Harbour** in the browser and check its
   composition at desktop and mobile sizes before committing it.

The worked example produces a circle at one quarter width and half height, plus
a capsule centred at three fifths width and two fifths height. At a 200 by 100
world their radii are 4 and 2.5 cells. The capsule half-vector is `(24, -8)`, so
the same exported composition scales proportionally at another resolution.
Promoted JSON is fixed geometry: the existing obstacle amount control does not
alter it unless the promotion deliberately adds a scaling rule.
