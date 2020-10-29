/*
 * @adonisjs/events
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/// <reference path="../../adonis-typings/events.ts" />

import Emittery from 'emittery'
import { ApplicationContract } from '@ioc:Adonis/Core/Application'
import {
	AnyHandler,
	EventsList,
	TrapHandler,
	EventHandler,
	DataForEvent,
	TrapAllHandler,
	EmitterContract,
	EmitterTransportContract,
} from '@ioc:Adonis/Core/Event'

import { IocResolver } from '../IocResolver'

/**
 * Emitter class exposes the API for async event emitter built on top of
 * Emittery. It also exposes an API to pre-define the Typescript types
 * for different events.
 */
export class Emitter implements EmitterContract {
	public transport: EmitterTransportContract = new Emittery()
	private app?: ApplicationContract
	private iocResolver?: IocResolver

	private trappingEvents: boolean = false
	private traps: Map<string, TrapHandler> = new Map()
	private trapAllHandler?: TrapAllHandler

	constructor(app?: ApplicationContract) {
		if (app) {
			this.iocResolver = new IocResolver(app)
		}
		this.app = app
	}

	/**
	 * Returns reference to the IoC resolver. Do not call this method until
	 * handler is not a string
	 */
	private getResolver(handler: string): IocResolver {
		if (!this.iocResolver) {
			throw new Error(
				`Cannot resolve string based event handler "${handler}". IoC container is not provided to the event emitter`
			)
		}

		return this.iocResolver
	}

	/**
	 * Define event handler for a given event
	 */
	public on<K extends keyof EventsList | string>(
		event: K,
		handler: EventHandler<DataForEvent<K>> | string
	): this {
		if (typeof handler === 'string') {
			handler = this.getResolver(handler).getEventHandler(event as string, handler)
		}

		this.transport.on(event as string, handler)
		return this
	}

	/**
	 * Define event handler for a given event and to be called
	 * only once.
	 */
	public once<K extends keyof EventsList | string>(
		event: K,
		handler: EventHandler<DataForEvent<K>> | string
	): this {
		this.transport.once(event as string).then((data) => {
			if (typeof handler === 'string') {
				this.getResolver(handler).getEventHandler(event as string, handler)(data)
				this.getResolver(handler).removeEventHandler(event as string, handler)
			} else {
				handler(data)
			}
		})
		return this
	}

	/**
	 * Define catch all event handler to listen for all events.
	 */
	public onAny(handler: AnyHandler | string): this {
		if (typeof handler === 'string') {
			handler = this.getResolver(handler).getAnyHandler(handler)
		}

		this.transport.onAny(handler)
		return this
	}

	/**
	 * Emit event
	 */
	public emit<K extends keyof EventsList | string>(event: K, data: DataForEvent<K>) {
		if (this.trappingEvents) {
			/**
			 * Give preference to the handler for a specific event
			 */
			if (this.traps.has(event)) {
				this.traps.get(event)!(data)
				return
			}

			/**
			 * Invoke catch all (if defined)
			 */
			if (this.trapAllHandler) {
				this.trapAllHandler(event as any, data)
				return
			}
		}

		this.transport
			.emit(event as string, data)
			.catch((err) =>
				this.app?.logger.error(`An event handler for '${event}' event thrown an error`, err)
			)
	}

	/**
	 * Remove existing event listener
	 */
	public off<K extends keyof EventsList>(event: K | string, handler: EventHandler | string): void {
		if (typeof handler === 'string') {
			const offHandler = this.getResolver(handler).removeEventHandler(event as string, handler)
			if (offHandler) {
				this.transport.off(event as string, offHandler)
			}
			return
		}

		this.transport.off(event as string, handler)
	}

	/**
	 * Remove existing event listener for catch all handler
	 */
	public offAny(handler: AnyHandler | string): void {
		if (typeof handler === 'string') {
			const offHandler = this.getResolver(handler).removeAnyHandler(handler)
			if (offHandler) {
				this.transport.offAny(offHandler)
			}
			return
		}

		this.transport.offAny(handler)
	}

	/**
	 * Remove existing event listener.
	 * @alias off
	 */
	public clearListener<K extends keyof EventsList | string>(
		event: K,
		handler: EventHandler | string
	): void {
		this.off(event as string, handler)
	}

	/**
	 * Clear all listeners for a given event
	 */
	public clearListeners<K extends keyof EventsList | string>(event: K): void {
		this.transport.clearListeners(event as string)
	}

	/**
	 * Clear all listeners for all events
	 */
	public clearAllListeners(): void {
		this.transport.clearListeners()
	}

	/**
	 * Returns count of listeners for a given event or all
	 * events.
	 */
	public listenerCount<K extends keyof EventsList | string>(event?: K): number {
		return this.transport.listenerCount(event ? (event as string) : undefined)
	}

	/**
	 * Returns a boolean telling if listeners count for a given
	 * event or all events is greater than 0 or not.
	 */
	public hasListeners<K extends keyof EventsList | string>(event?: K): boolean {
		return this.listenerCount(event as string) > 0
	}

	/**
	 * Define custom namespace for event listeners. It is set to `App/Listeners`
	 * by default.
	 */
	public namespace(namespace: string): this {
		if (this.iocResolver) {
			this.iocResolver.namespace(namespace)
		}
		return this
	}

	/**
	 * Trap event instead of emitting it
	 */
	public trap<K extends keyof EventsList | string>(
		event: K,
		handler: TrapHandler<DataForEvent<K>>
	): this {
		this.trappingEvents = true
		this.traps.set(event, handler)
		return this
	}

	/**
	 * Trap all events instead of emitting them
	 */
	public trapAll(handler: TrapAllHandler): this {
		this.trappingEvents = true
		this.trapAllHandler = handler
		return this
	}

	/**
	 * Restore trap
	 */
	public restore(): this {
		this.trappingEvents = false
		this.traps.clear()
		this.trapAllHandler = undefined
		return this
	}
}
