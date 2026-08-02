/**
 * Redux / Redux Toolkit 解析器单元测试
 */
import { describe, it, expect } from 'vitest';
import { isReduxFile, parseReduxFile } from '../graph/parsers/redux-parser';

const ROOT = '/fake-project';

describe('isReduxFile', () => {
  it('识别 slices 目录下包含 createSlice 的文件', () => {
    const source = `
      import { createSlice } from '@reduxjs/toolkit';
      const userSlice = createSlice({ name: 'user', initialState: {}, reducers: {} });
      export default userSlice.reducer;
    `;
    expect(isReduxFile('/fake-project/src/features/user/userSlice.ts', source)).toBe(true);
  });

  it('识别 store 目录下的 configureStore 文件', () => {
    const source = `
      import { configureStore } from '@reduxjs/toolkit';
      import userReducer from './userSlice';
      export const store = configureStore({ reducer: { user: userReducer } });
    `;
    expect(isReduxFile('/fake-project/src/app/store.ts', source)).toBe(true);
  });

  it('不识别普通组件文件', () => {
    const source = `
      import React from 'react';
      export function App() { return <div>Hello</div>; }
    `;
    expect(isReduxFile('/fake-project/src/App.tsx', source)).toBe(false);
  });
});

describe('parseReduxFile - createSlice', () => {
  it('解析标准 RTK slice', async () => {
    const source = `
      import { createSlice, PayloadAction } from '@reduxjs/toolkit';

      interface UserState {
        user: { id: string; name: string } | null;
        token: string;
        loading: boolean;
      }

      const initialState: UserState = {
        user: null,
        token: '',
        loading: false,
      };

      const userSlice = createSlice({
        name: 'user',
        initialState,
        reducers: {
          setUser(state, action: PayloadAction<UserState['user']>) {
            state.user = action.payload;
          },
          setToken(state, action: PayloadAction<string>) {
            state.token = action.payload;
          },
          setLoading(state, action: PayloadAction<boolean>) {
            state.loading = action.payload;
          },
          logout(state) {
            state.user = null;
            state.token = '';
          },
        },
      });

      export const { setUser, setToken, setLoading, logout } = userSlice.actions;
      export default userSlice.reducer;
    `;

    const result = await parseReduxFile(
      '/fake-project/src/features/user/userSlice.ts',
      ROOT,
      source,
      'typescript',
    );

    expect(result.slices.length).toBe(1);
    const slice = result.slices[0];
    expect(slice.type).toBe('redux-slice');
    expect(slice.name).toBe('user');
    expect(slice.level).toBe('L2');

    const stateNames = result.elements.filter((e) => e.type === 'redux-state').map((e) => e.name);
    expect(stateNames).toContain('user');
    expect(stateNames).toContain('token');
    expect(stateNames).toContain('loading');

    const reducerNames = result.elements.filter((e) => e.type === 'redux-reducer').map((e) => e.name);
    expect(reducerNames).toContain('setUser');
    expect(reducerNames).toContain('setToken');
    expect(reducerNames).toContain('setLoading');
    expect(reducerNames).toContain('logout');

    // RTK 中每个 reducer 自动生成同名 action
    const actionNames = result.elements.filter((e) => e.type === 'redux-action').map((e) => e.name);
    expect(actionNames).toContain('user/setUser');
    expect(actionNames).toContain('user/setToken');
    expect(actionNames).toContain('user/logout');

    for (const action of result.elements.filter((e) => e.type === 'redux-action')) {
      expect(action.attrs.actionType).toBeDefined();
    }
  });

  it('解析 counter slice', async () => {
    const source = `
      import { createSlice } from '@reduxjs/toolkit';

      const counterSlice = createSlice({
        name: 'counter',
        initialState: { value: 0 },
        reducers: {
          increment: (state) => { state.value += 1; },
          decrement: (state) => { state.value -= 1; },
          incrementByAmount: (state, action) => { state.value += action.payload; },
        },
      });

      export const { increment, decrement, incrementByAmount } = counterSlice.actions;
      export default counterSlice.reducer;
    `;

    const result = await parseReduxFile(
      '/fake-project/src/features/counter/counterSlice.ts',
      ROOT,
      source,
      'typescript',
    );

    expect(result.slices[0].name).toBe('counter');
    expect(result.elements.filter((e) => e.type === 'redux-state').map((e) => e.name)).toContain('value');
    expect(result.elements.filter((e) => e.type === 'redux-reducer')).toHaveLength(3);
    expect(result.elements.filter((e) => e.type === 'redux-action')).toHaveLength(3);
  });
});

describe('parseReduxFile - createAction / createReducer', () => {
  it('解析独立的 createAction', async () => {
    const source = `
      import { createAction } from '@reduxjs/toolkit';

      export const increment = createAction<number>('counter/increment');
      export const decrement = createAction<number>('counter/decrement');
      export const reset = createAction('counter/reset');
    `;

    const result = await parseReduxFile(
      '/fake-project/src/features/counter/actions.ts',
      ROOT,
      source,
      'typescript',
    );

    const actionNames = result.actions.map((a) => a.name);
    expect(actionNames).toContain('increment');
    expect(actionNames).toContain('decrement');
    expect(actionNames).toContain('reset');

    const incrementAction = result.actions.find((a) => a.name === 'increment');
    expect(incrementAction?.attrs.actionType).toBe('counter/increment');
  });

  it('解析独立的 createReducer', async () => {
    const source = `
      import { createReducer } from '@reduxjs/toolkit';
      import { increment, decrement } from './actions';

      export const counterReducer = createReducer(0, (builder) => {
        builder
          .addCase(increment, (state, action) => state + action.payload)
          .addCase(decrement, (state, action) => state - action.payload);
      });
    `;

    const result = await parseReduxFile(
      '/fake-project/src/features/counter/reducer.ts',
      ROOT,
      source,
      'typescript',
    );

    const reducerNames = result.reducers.map((r) => r.name);
    expect(reducerNames).toContain('counterReducer');
  });
});

describe('parseReduxFile - selectors', () => {
  it('解析 createSelector 定义的 selector', async () => {
    const source = `
      import { createSelector } from '@reduxjs/toolkit';

      const selectUserState = (state) => state.user;

      export const selectCurrentUser = createSelector(
        selectUserState,
        (user) => user.current,
      );

      export const selectUserName = createSelector(
        selectCurrentUser,
        (user) => user?.name,
      );
    `;

    const result = await parseReduxFile(
      '/fake-project/src/features/user/selectors.ts',
      ROOT,
      source,
      'typescript',
    );

    const selectorNames = result.selectors.map((s) => s.name);
    expect(selectorNames).toContain('selectCurrentUser');
    expect(selectorNames).toContain('selectUserName');
  });

  it('识别 selectXxx 命名约定的简单 selector', async () => {
    const source = `
      export const selectCount = (state) => state.counter.value;
      export const selectStatus = (state) => state.user.loading;
    `;

    const result = await parseReduxFile(
      '/fake-project/src/features/counter/selectors.ts',
      ROOT,
      source,
      'typescript',
    );

    const selectorNames = result.selectors.map((s) => s.name);
    expect(selectorNames).toContain('selectCount');
    expect(selectorNames).toContain('selectStatus');
  });
});

describe('parseReduxFile - 元素属性', () => {
  it('slice 元素携带正确的 parentName', async () => {
    const source = `
      import { createSlice } from '@reduxjs/toolkit';
      const counter = createSlice({
        name: 'counter',
        initialState: { value: 0 },
        reducers: { increment: (s) => { s.value++; } },
      });
      export default counter.reducer;
    `;

    const result = await parseReduxFile(
      '/fake-project/src/features/counter/counterSlice.ts',
      ROOT,
      source,
      'typescript',
    );

    for (const elem of result.elements) {
      expect(elem.attrs.parentName).toBe('counter');
      expect(elem.level).toBe('L3');
    }
  });
});
