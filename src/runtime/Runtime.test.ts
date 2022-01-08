import { assert } from "console";
import { Subject } from "rxjs";
import { RuntimeClass } from "./Runtime";

import { WebBus } from "./WebBus";
import { WebBusEvent } from "./WebBusEvent";
declare global {
  var testSubject: Subject<unknown> | undefined;
}

jest.mock("../lib/getAuth", () => {
  return {
    getAuth: () => {
      return {
        token: "testtoken",
      };
    },
  };
});

jest.mock("../lib/getProjectID", () => {
  return {
    getProjectID: () => {
      return "testproject";
    },
  };
});

jest.mock("../api/getEvents", () => {
  return {
    getEvents: () => {
      const events = require("./Runtime.events.test.json");
      if (!globalThis.testSubject == undefined) {
        globalThis.testSubject?.next(Promise.resolve(events));
      } else {
        return Promise.resolve(events);
      }
    },
  };
});

jest.mock("../api/getIDPool", () => {
  return {
    getIDPool: () => {
      const idpool = require("./Runtime.idpool.test.json");

      return Promise.resolve(idpool);
    },
  };
});

jest.mock("../api/postEvent", () => {
  return {
    postEvent: (tokenId: string, projectId: string, events: any) => {
      if (!globalThis.testSubject == undefined) {
        console.log(globalThis.testSubject);
        globalThis.testSubject?.next(events);
      }
    },
  };
});

// test("onReady gets called", () => {
//   const RuntimeClass = require("./Runtime.ts");

//   const Runtime = RuntimeClass.RuntimeClass.getRuntime();
//   const isReady = jest.fn();
//   Runtime.onReady(() => {});
//   expect(isReady).toBeCalled();
// });

// I will create a global subject and next the result of getEvents() to test if all the events are being retrieved or not -: (Retrieve Events())

test("check output of getEvents", () => {
  const a = require("./test_functions/TestSubject");
  globalThis.testSubject = a.sub;

  globalThis.testSubject?.subscribe({
    next: async (v: any) => {
      var a: any[] = await v.then((r: any) => {
        return r;
      });
      const test = require("./Runtime.events.test.json");

      assert(a.length === test.length);
    },
  });

  const RuntimeClass = require("./Runtime.ts");
  globalThis.testSubject = undefined;
});

test("check if events being sent are recieved or not i.e output of postEvent ", () => {
  const a = require("./test_functions/TestSubject");
  globalThis.testSubject = a.sub;

  const RuntimeClass = require("./Runtime.ts");
  const event: WebBusEvent = {
    type: "CREATE",
    payload: {
      ID: "test",
      slice: {},
    },
  };
  const Runtime: RuntimeClass = RuntimeClass.RuntimeClass.getRuntime();
  globalThis.testSubject?.subscribe({
    next: (v: any) => {
      console.log(v);
      assert(v.type === "CREATE");
      assert(v.payload.ID === "test");
      assert(Object.keys(v.payload.slice).length == 0);
    },
  });

  Runtime.addEvent(event);
});
