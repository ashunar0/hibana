// @ts-nocheck
import { Signal } from "hibana-core";

export component Counter() {
  const count = new Signal(0);
  <button onClick={() => count.value++}>Count: {count.value}</button>
}
