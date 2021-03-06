import { Inject, Injectable, Injector } from '@angular/core';
import { getActionTypeFromInstance, NgxsNextPluginFn, NgxsPlugin, Store } from '@ngxs/store';
import { tap } from 'rxjs/operators';

import {
  NGXS_DEVTOOLS_OPTIONS,
  NgxsDevtoolsAction,
  NgxsDevtoolsExtension,
  NgxsDevtoolsOptions
} from './symbols';

/**
 * Adds support for the Redux Devtools extension:
 * http://extension.remotedev.io/
 */
@Injectable()
export class NgxsReduxDevtoolsPlugin implements NgxsPlugin {
  private readonly devtoolsExtension: NgxsDevtoolsExtension | null = null;
  private readonly windowObj: any = typeof window !== 'undefined' ? window : {};

  constructor(
    @Inject(NGXS_DEVTOOLS_OPTIONS) private _options: NgxsDevtoolsOptions,
    private _injector: Injector
  ) {
    const globalDevtools =
      this.windowObj['__REDUX_DEVTOOLS_EXTENSION__'] || this.windowObj['devToolsExtension'];
    if (globalDevtools) {
      this.devtoolsExtension = globalDevtools.connect(_options) as NgxsDevtoolsExtension;
      this.devtoolsExtension.subscribe(a => this.dispatched(a));
    }
  }

  /**
   * Lazy get the store for circular dependency issues
   */
  private get store(): Store {
    return this._injector.get<Store>(Store);
  }

  /**
   * Middleware handle function
   */
  handle(state: any, action: any, next: NgxsNextPluginFn) {
    const isDisabled = this._options && this._options.disabled;
    if (!this.devtoolsExtension || isDisabled) {
      return next(state, action);
    }

    return next(state, action).pipe(
      tap(newState => {
        // if init action, send initial state to dev tools
        const isInitAction = getActionTypeFromInstance(action) === '@@INIT';
        if (isInitAction) {
          this.devtoolsExtension!.init(state);
        } else {
          const type = getActionTypeFromInstance(action);

          this.devtoolsExtension!.send({ ...action, type }, newState);
        }
      })
    );
  }

  /**
   * Handle the action from the dev tools subscription
   */
  dispatched(action: NgxsDevtoolsAction) {
    if (action.type === 'DISPATCH') {
      if (
        action.payload.type === 'JUMP_TO_ACTION' ||
        action.payload.type === 'JUMP_TO_STATE'
      ) {
        const prevState = JSON.parse(action.state);
        this.store.reset(prevState);
      } else if (action.payload.type === 'TOGGLE_ACTION') {
        console.warn('Skip is not supported at this time.');
      } else if (action.payload.type === 'IMPORT_STATE') {
        const {
          actionsById,
          computedStates,
          currentStateIndex
        } = action.payload.nextLiftedState;
        this.devtoolsExtension!.init(computedStates[0].state);
        Object.keys(actionsById)
          .filter(actionId => actionId !== '0')
          .forEach(actionId =>
            this.devtoolsExtension!.send(actionsById[actionId], computedStates[actionId].state)
          );
        this.store.reset(computedStates[currentStateIndex].state);
      }
    } else if (action.type === 'ACTION') {
      const actionPayload = JSON.parse(action.payload);
      this.store.dispatch(actionPayload);
    }
  }
}
