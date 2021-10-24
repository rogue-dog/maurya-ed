import React, { useEffect, useRef, useState } from "react";
import { Subscription } from "rxjs";
import { ComponentItem, ComponentRegistry } from "../rxjs/ComponentRegistry";
import { DesignComponentSelected } from "../rxjs/DrawState";
import getCoords from "../utils/getCoords";
const BaseWidth = 1440;
const BaseHeight = 900;

declare interface WebCreateData {
	compKey: string;
	pkg: string;
	tempID: string;
}

export interface WebPatchData {
	tempID: string;
	style: React.CSSProperties;
}

declare interface WebBusEvent {
	type: "CREATE" | "UPDATE" | "PATCH" | "DELETE"; // types of event
	payload: WebCreateData | WebPatchData; // payload
}

declare const SubscribeWebBus: (
	next: (v: WebBusEvent | null) => void
) => Subscription;

declare const PostCreateEvent: (
	payload: Omit<WebCreateData, "tempID">
) => string;

declare const PostPatchEvent: (payload: WebPatchData) => string;

export const CanvasBox: React.FC = (props) => {
	const box = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLDivElement>(null);
	const root = useRef<HTMLDivElement>(null);
	// canvas size resizeable
	const [canvasHeight, setCanvasHeight] = useState<string>("");
	const [canvasWidth, setCanvasWidth] = useState<string>("");
	useEffect(() => {
		// TODO: check if screen height is greater than screen width
		const resize = () => {
			if (box.current && canvas.current) {
				const width = box.current.getBoundingClientRect().width;
				let factor = 1;
				if (width > BaseWidth) {
					factor = Math.floor(width / BaseWidth);
					setCanvasWidth(`${BaseWidth * factor}px`);
					setCanvasHeight(`${BaseHeight * factor}px`);
				} else {
					factor = Math.ceil((BaseWidth / width) * 10) / 10;
					setCanvasWidth(`${BaseWidth / factor}px`);
					setCanvasHeight(`${BaseHeight / factor}px`);
				}
			}
		};
		resize();
		window.addEventListener("resize", resize);
		return () => {
			window.removeEventListener("resize", resize);
		};
	}, [box, canvas]);

	// post events: create and patch
	useEffect(() => {
		if (canvas.current && root.current) {
			canvas.current.addEventListener("mouseup", (ev) => {
				if (DesignComponentSelected.value) {
					const tempID = PostCreateEvent({
						compKey: DesignComponentSelected.value.key,
						pkg: "design",
					});
					const { top, left } = getCoords(root.current!);
					PostPatchEvent({
						tempID,
						style: {
							position: "absolute",
							top: `${ev.clientY - top}px`,
							left: `${ev.clientX - left}px`,
						},
					});
				}
			});
		}
	}, [canvas, root]);

	// add component
	const [renderedComps, setRenderedComps] = useState<
		[React.FC, object, string][]
	>([]);
	useEffect(() => {
		SubscribeWebBus((v: WebBusEvent | null) => {
			if (v) {
				if (v.type === "CREATE") {
					setRenderedComps((val) => {
						let compItem: ComponentItem;
						for (
							let i = 0;
							i < ComponentRegistry.value.length;
							i++
						) {
							const compItems = ComponentRegistry.value[i][1];
							for (let j = 0; j < compItems.length; j++) {
								if (
									compItems[j].key ===
									(v.payload as WebCreateData).compKey
								) {
									compItem = compItems[j];
								}
							}
						}
						if (compItem!)
							return [
								...val,
								[
									compItem.renderComp,
									{ ...compItem.renderCompProps },
									v.payload.tempID,
								],
							];
						return [...val];
					});
				}

				if (v.type === "PATCH") {
					setRenderedComps((val) => {
						for (let i = 0; i < val.length; i++) {
							const [Comp, props, tempID] = val[i];
							if (tempID === v.payload.tempID) {
								(props as any).style = (
									v.payload as WebPatchData
								).style;
							}
						}
						return [...val];
					});
				}
			}
		});
	}, [setRenderedComps]);

	return (
		<div
			style={{
				background: "#C4C4C4",
				height: "100%",
				width: "100%",
				position: "relative",
			}}
			ref={box}
		>
			<div
				ref={canvas}
				style={{
					width: canvasWidth,
					height: canvasHeight,
					background: "white",
					position: "absolute",
					top: "50%",
					left: "50%",
					transform: "translate(-50%, -50%)",
					overflow: "hidden",
					boxSizing: "border-box",
				}}
			>
				<div
					id="canvasRoot"
					style={{
						overflow: "auto",
						width: canvasWidth,
						height: "auto",
						scrollbarWidth: "thin",
						boxSizing: "border-box",
					}}
					ref={root}
				>
					{renderedComps.map(([Comp, props, key]) => {
						return <Comp {...props} key={key} data-id={key} />;
					})}
				</div>
			</div>
		</div>
	);
};
