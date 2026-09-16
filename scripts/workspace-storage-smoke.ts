import { strict as assert } from "node:assert";
import {
  legacyActionStorageKey,
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  workspaceStorageKey,
} from "../src/lib/stepwise-workspace-storage";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
const initial = loadWorkspaceSnapshot(storage);
assert.equal(initial.version, 2);
assert.equal(initial.goals.G4.dri.id, "H-LIN-RAN");

storage.setItem(
  legacyActionStorageKey,
  JSON.stringify([
    {
      ...initial.actions[0],
      executor: "规则 Agent",
      approvedBy: "林然｜队长",
    },
    {
      ...initial.actions[1],
      id: "A-CUSTOM",
      executor: "自带研究 Agent",
      approvedBy: "外部负责人｜顾问",
    },
  ]),
);

const migrated = loadWorkspaceSnapshot(storage);
assert.equal(migrated.actions[0].executor.id, "A-RULES");
assert.equal(migrated.actions[0].approvedBy.id, "H-LIN-RAN");
assert.equal(migrated.actions[1].executor.name, "自带研究 Agent");
assert.equal(migrated.actions[1].approvedBy.role, "顾问");

const review = migrated.decompositionReviews.find((item) => item.id === "D3");
assert(review);
const child = review.proposedGoals[0];
migrated.goals[child.proposedId] = {
  ...child,
  id: child.proposedId,
  parentId: review.goalId,
  level: migrated.goals[review.goalId].level + 1,
  status: "draft",
};
review.childGoalIds = [child.proposedId];
review.proposedGoals = [];
review.status = "confirmed";

saveWorkspaceSnapshot(storage, {
  goals: migrated.goals,
  actions: migrated.actions,
  relations: migrated.relations,
  decompositionReviews: migrated.decompositionReviews,
});

assert.equal(storage.getItem(legacyActionStorageKey), null);
assert(storage.getItem(workspaceStorageKey));

const restored = loadWorkspaceSnapshot(storage);
assert.equal(restored.goals.G41.parentId, "G4");
assert.equal(
  restored.decompositionReviews.find((item) => item.id === "D3")?.status,
  "confirmed",
);
assert.equal(restored.actions[1].executor.name, "自带研究 Agent");

console.log(
  JSON.stringify({
    version: restored.version,
    migratedLegacyActors: true,
    preservedCustomActor: true,
    restoredConfirmedGoal: "G41",
  }),
);
