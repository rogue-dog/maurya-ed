/**
    Copyright 2021 Quaffles    
 
    This file is part of Maurya Editor.
    Maurya Editor is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.
    Maurya Editor is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with Foobar.  If not, see <https://www.gnu.org/licenses/>.
 */
import React from "react";
import { Subject } from "rxjs";
import { createGlobalVariable } from "../../../../lib/createGlobalVariable";
import { ObjectVisitor } from "../../../../lib/ObjectVisitor";
import { VisitableObject } from "../../../../lib/VisitableObject";
import { Runtime } from "../../../../runtime/Runtime";
import {
  WebBusEvent,
  WebCreateData,
  WebPatchData,
} from "../../../../runtime/WebBusEvent";
import { DEV_ELEMENT_RENDERED } from "../../decorators/PostElementRenderedDecoratot";
import { PickAndFlatten } from "../../lib/utilityTypes";
import { DesignElementRegistry } from "../../registry/DesignElementRegistry";
import { AcceptsChild } from "../../types/AcceptsChild";
import { DesignElement } from "../../types/DesignElement";
import { ElementBus } from "../../types/ElementBus";
import { ElementState } from "../../types/ElementState";
import { SerializableElementState } from "../../types/SerializableElementState";
import { ElementStateFactory } from "../ElementStateFactory/ElementStateFactory";

class DesignRuntimeClass {
  private static instance: DesignRuntimeClass = new DesignRuntimeClass();
  private canvasRoot: {
    ref: React.RefObject<HTMLDivElement>;
    bus: Subject<AcceptsChild>;
  } = {
    ref: React.createRef(),
    bus: new Subject<AcceptsChild>(),
  };
  private state: { [ID: string]: ElementState } = {};
  private acceptsChild: string[] = [];
  // true if first render has been done
  // first render is treated special because we need to
  // carefully render element one by one. Here render means
  // until the element has subscribed to it's bus
  // first render is done by populateCanvas method
  private firstRenderDone: boolean = false;
  // an array to store all the callbacks once Runtime is ready
  private onReadySubscribers: (() => void)[] = [];
  // a flag to indicate whether the Runtime is ready
  // Runtime is ready once all the events have been loaded on WebBus
  private isReady: boolean = false;
  private constructor() {
    Runtime.onReady(() => {
      const gen = Runtime.getWebBusEventGenerator();
      for (const webBusEvent of gen) {
        switch (webBusEvent.type) {
          case "CREATE":
            this.handleCreateEvent(webBusEvent);
            break;
          case "PATCH":
            this.handlePatchEvent(webBusEvent);
            break;
          default:
            console.error("unhandled type of event", webBusEvent);
        }
      }
      this.callOnReadySubscribers();
      this.isReady = true;
      Runtime.subscribeWebBus({
        next: (v) => {
          switch (v.type) {
            case "CREATE":
              this.handleCreateEvent(v);
              break;
            case "PATCH":
              this.handlePatchEvent(v);
              break;
            default:
              console.error("unhandled type of event", v);
          }
        },
      });
      Runtime.subscribeSessionWebBus({
        next: () => {},
      });
      Runtime.subscribeWebDevBus({
        next: () => {},
      });
    });
  }
  public static getInstance() {
    if (DesignRuntimeClass.instance === undefined) {
      DesignRuntimeClass.instance = new DesignRuntimeClass();
    }
    return DesignRuntimeClass.instance;
  }
  private callOnReadySubscribers() {
    if (!this.isReady) {
      // an extra guide to prevent from being called more than once
      this.onReadySubscribers.forEach((f) => {
        f();
      });
    }
  }
  // register/call cb once DesignRuntime is ready
  onReady(cb: () => void) {
    // call immediately if the DesignRuntime is already ready
    // else push in onReadySubscibers
    if (this.isReady) {
      cb();
    } else {
      this.onReadySubscribers.push(cb);
    }
  }
  public addElement(ID: string, state: ElementState) {
    this.state[ID] = state;
  }
  public registerChildAcceptor(ID: string) {
    this.acceptsChild.push(ID);
  }
  public deregisterChildAcceptor(ID: string) {
    this.acceptsChild = this.acceptsChild.filter((childID) => {
      return childID !== ID;
    });
  }
  public getChildAcceptors() {
    return [...this.acceptsChild];
  }
  public getState(): { [ID: string]: SerializableElementState } {
    const elementIDs = Object.keys(this.state);
    const stringifiable: { [ID: string]: Partial<ElementState> } = {};
    elementIDs.forEach((elementID) => {
      const elementState = this.state[elementID];
      const stringifiableElement: Partial<ElementState> = { ...elementState };
      delete stringifiableElement.bus;
      delete stringifiableElement.ref;
      stringifiable[elementID] = stringifiableElement;
    });
    const stringifiedState = JSON.stringify(stringifiable);
    return JSON.parse(stringifiedState) as {
      [ID: string]: SerializableElementState;
    };
  }
  public getStateFor(ID: string): SerializableElementState {
    if (this.state[ID]) {
      const stringifiable: Partial<ElementState> = { ...this.state[ID] };
      delete stringifiable.bus;
      delete stringifiable.ref;
      const elementState = JSON.stringify(stringifiable);
      return JSON.parse(elementState) as SerializableElementState;
    } else {
      throw Error("Fetching state for non-existent element with ID" + ID);
    }
  }
  public getBusFor(ID: string): ElementBus {
    return this.state[ID].bus;
  }
  public getRefFor(ID: string): React.RefObject<HTMLElement> {
    return this.state[ID].ref;
  }
  private wireElement(parentID: string, childID: string): void {
    if (parentID === "root") {
      this.canvasRoot.bus.next({ acceptchild: childID });
    } else if (parentID) {
      this.state[parentID].bus.next({
        acceptchild: childID,
      });
    } else {
      throw new Error("parent should have existed already");
    }
  }
  private dewireElement(parentID: string, childID: string): void {
    if (parentID === "root") {
      this.canvasRoot.bus.next({ removechild: childID });
    } else if (parentID) {
      this.state[parentID].bus.next({
        removechild: childID,
      });
    } else {
      throw new Error("parent should have existed already");
    }
  }
  private rewireElement(
    oldParentID: string,
    newParentID: string,
    childID: string
  ) {
    if (oldParentID === newParentID) return;
    this.dewireElement(oldParentID, childID);
    this.wireElement(newParentID, childID);
  }
  private handleCreateEvent(v: WebBusEvent) {
    // update runtime state
    const payload = v.payload as WebCreateData;
    // TODO: ensure that payload.state!.parent exists
    // it creates an element with default values
    const newElement = ElementStateFactory.create(
      payload.compKey,
      payload.ID,
      payload.state!.parent
    );
    // overriding the default values by the event values
    newElement.state = {
      style: payload.state?.style || {},
      properties: payload.state?.properties || {},
      appearance: payload.state?.appearance || {},
      parent: payload.state?.parent,
      alias: payload.state?.alias,
    };
    this.addElement(payload.ID, newElement);
    // send to parent
    if (this.firstRenderDone)
      this.wireElement(payload.state!.parent, payload.ID);
  }
  // apply to patch to the DesignRuntime.state
  private __handlePatchEvent(
    ID: string,
    patch: Partial<PickAndFlatten<ElementState, "state">>
  ) {
    const visitable = new VisitableObject(patch);
    visitable.visit(
      new ObjectVisitor({
        enterTerminal: (key, value, parentObj, pathSoFar) => {
          let cur: any = this.state[ID].state;
          for (let i = 0; i < pathSoFar.length; i++) {
            if (i === pathSoFar.length - 1) {
              cur[pathSoFar[i]] = value;
              break;
            }
            if (cur[pathSoFar[i]] === undefined) {
              cur[pathSoFar[i]] = {};
            }
            cur = cur[pathSoFar[i]];
          }
        },
      })
    );
  }
  private handlePatchEvent(v: WebBusEvent) {
    // check if parent got updated
    // send removechild to old parent and acceptchild to new parent
    // send element to parent
    const payload = v["payload"] as WebPatchData;
    const keys = Object.keys(payload.slice);
    for (let key of keys) {
      switch (key) {
        case "style":
        case "appearance":
        case "properties":
          if (this.firstRenderDone) {
            this.__handlePatchEvent(payload.ID, payload.slice);
            this.getBusFor(payload.ID).next({
              state: this.state[payload.ID]["state"],
            });
          } else {
            this.__handlePatchEvent(payload.ID, payload.slice);
          }
          break;
        case "parent":
          if (this.firstRenderDone) {
            const oldParent = this.state[payload.ID].state.parent;
            this.__handlePatchEvent(payload.ID, {
              parent: payload.slice.parent,
            });
            const newParent = this.state[payload.ID].state.parent;
            this.rewireElement(oldParent, newParent, payload.ID);
          } else {
            this.__handlePatchEvent(payload.ID, {
              parent: payload.slice.parent,
            });
          }
          break;
      }
    }
  }
  public populateCanvas() {
    // TODO: put reverse into a different function
    // Create a reverse mapping of this.state
    const reverse_mapped = this.reverseMapping();

    this.__populateCanvas("root", reverse_mapped);
  }

  // This Function will Reverse map the State and Parents would become keys and Children woud be their values.
  private reverseMapping() {
    const r: { [parent: string]: string[] } = {};
    for (const [key, value] of Object.entries(this.state)) {
      const parent = value.state.parent;
      if (!r[parent]) {
        r[parent] = [];
      }
      r[parent].push(key);
    }
    return r;
  }
  // This method is a helper function which will populate the canvas
  private __populateCanvas(
    currNode: string,
    mapping: { [parent: string]: string[] }
  ) {
    // This method will traverse through the Reverse Mapped Tree.
    const ar = mapping[currNode];
    if (!ar) {
      return;
    }
    // first render the currNode
    // then recursively render all it's child nodes
    for (const value of ar) {
      const subscription = Runtime.subscribeWebDevBus({
        next: (v) => {
          if (v.type === DEV_ELEMENT_RENDERED && v.payload === value) {
            subscription.unsubscribe();
            this.__populateCanvas(value, mapping);
          }
        },
      });
      this.wireElement(currNode, value);
    }
    if (currNode === "root") {
      this.firstRenderDone = true;
    }
  }
  public setCanvasRoot(ref: React.RefObject<HTMLDivElement>) {
    // only ref changes, others are same as previous
    this.canvasRoot.ref = ref;
    // populate canvas
    this.onReady(this.populateCanvas.bind(this));
  }
  public getCanvasRoot() {
    return { ...this.canvasRoot };
  }
  /**
   * record the event if the element will appear in the produced App
   * don't record if it's just an element needed during development inside canvas
   */
  public createElement(
    compKey: string,
    state: Pick<ElementState, "state">,
    record: boolean = false
  ): string {
    const webCreateData: Omit<WebCreateData, "ID"> = {
      compKey: compKey,
      pkg: "design",
      state: state.state,
    };
    if (record) {
      return Runtime.postCreateEvent(webCreateData);
    } else {
      const newID = Runtime.getID();
      this.handleCreateEvent({
        type: "CREATE",
        payload: { ID: newID, ...webCreateData },
      });
      return newID;
    }
  }
  public patchDevState(ID: string, patch: Partial<ElementState>) {
    const visitable = new VisitableObject(patch);
    visitable.visit(
      new ObjectVisitor({
        enterTerminal: (key, value, parentObj, pathSoFar) => {
          let cur: any = this.state[ID];
          for (let i = 0; i < pathSoFar.length; i++) {
            if (i === pathSoFar.length - 1) {
              cur[pathSoFar[i]] = value;
              break;
            }
            if (cur[pathSoFar[i]] === undefined) {
              cur[pathSoFar[i]] = {};
            }
            cur = cur[pathSoFar[i]];
          }
        },
      })
    );
  }
  /**
   * if record is true than a PatchRequest to backend will be sent
   */
  public patchState(
    ID: string,
    patch: Partial<PickAndFlatten<ElementState, "state">>,
    record: boolean = false
  ) {
    if (record) {
      Runtime.postPatchEvent({ ID, slice: patch });
    } else {
      this.handlePatchEvent({ type: "PATCH", payload: { ID, slice: patch } });
    }
  }
  public patchStyle(
    ID: string,
    patch: React.CSSProperties,
    record: boolean = false
  ) {
    this.patchState(ID, { style: patch }, record);
  }
  public registerDesignElement(
    categoryName: string,
    designElementManifest: DesignElement
  ) {
    if (!DesignElementRegistry.getCategoryByName(categoryName)) {
      DesignElementRegistry.registerCategory({
        category: categoryName,
        elements: [designElementManifest],
      });
    } else {
      DesignElementRegistry.registerElement(
        categoryName,
        designElementManifest
      );
    }
  }
  // inserts or updates a new design element in the registry
  upsertDesignElement(
    categoryName: string,
    designElementManifest: DesignElement
  ) {
    // register category if not registered
    if (!DesignElementRegistry.getCategoryByName(categoryName)) {
      DesignElementRegistry.registerCategory({
        category: categoryName,
        elements: [],
      });
    }
    // remove design element if it exists
    try {
      DesignElementRegistry.unregisterElementByKey(designElementManifest.key);
    } catch (err: any) {
      if (err.message === "element doesn't exist in the registry") {
      } else {
        throw err;
      }
    }
    // register design element again
    DesignElementRegistry.registerElement(categoryName, designElementManifest);
  }
  // remove design element if it exists, otherwise throw error
  removeDesignElement(
    categoryName: string,
    designElementManifest: DesignElement
  ) {
    DesignElementRegistry.unregisterElementByKey(designElementManifest.key);
    // remove category is it becomes empty after removing the design element
    if (!DesignElementRegistry.getCategoryByName(categoryName)) {
      throw Error(`category ${categoryName} doesn't exist`);
    }
    if (
      DesignElementRegistry.getCategoryByName(categoryName)?.elements.length ===
      0
    ) {
      DesignElementRegistry.unregister(
        DesignElementRegistry.getCategoryByName(categoryName)!
      );
    }
  }
}

export const DesignRuntime = createGlobalVariable(
  "DesignRuntime",
  DesignRuntimeClass.getInstance()
);
