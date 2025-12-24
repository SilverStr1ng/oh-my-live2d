import { isArray } from 'tianjie';

import { Events } from './events.js';
import { GlobalStyle } from './global-style.js';
import { Menus } from './menus.js';
import { Models } from './models.js';
import { PixiApp } from './pixi.js';
import { Stage } from './stage.js';
import { StatusBar } from './status-bar.js';
import { Tips } from './tips.js';
import { DEFAULT_OPTIONS } from '../config/index.js';
import { WindowSizeType } from '../constants/index.js';
import { CommonStyleType } from '../types/common.js';
import { EventFn, LoadEventFn } from '../types/events/index.js';
import type { DefaultOptions } from '../types/index.js';
import { Oml2dEvents, Oml2dMethods, Oml2dProperties } from '../types/oml2d/index.js';
import type { Options } from '../types/options/index.js';
import {
  checkVersion,
  getRandomIndex,
  getWindowSizeType,
  handleCommonStyle,
  mergeOptions,
  onChangeWindowSize,
  printProjectInfo
} from '../utils/index.js';
import { getModelClothesIndex, getModelIndex, getStatus, setModelClothesIndex, setModelIndex, setStatus } from '../utils/store.js';

export class OhMyLive2D implements Oml2dProperties, Oml2dMethods, Oml2dEvents {
  private globalStyle: GlobalStyle;
  private stage: Stage;
  private statusBar: StatusBar;
  private tips: Tips;
  private menus: Menus;
  private models: Models;
  private pixiApp?: PixiApp;
  private _modelIndex: number = 0;
  private _modelClothesIndex: number = 0;
  private isFirstLoad = true;
  private isTransitioning = false;
  private pendingReload = false;
  version = __VERSION__;
  options: DefaultOptions;
  private events: Events;

  constructor(options: Options) {
    this.events = new Events();
    this.options = mergeOptions(DEFAULT_OPTIONS, options); // 合并配置项

    this.globalStyle = new GlobalStyle(this.options);
    this.stage = new Stage(this.options, this.events); // 实例化舞台
    this.statusBar = new StatusBar(this.options);
    this.tips = new Tips(this.options, this); // 提示框
    this.menus = new Menus(this.options, this); // 菜单
    this.models = new Models(this.options, this.events);
    this.modelIndex = getModelIndex();
    this.modelClothesIndex = getModelClothesIndex();
    console.log('[OML2D] Instance created - Patch Version: 20251224-V2');
    this.initialize();
  }
  private set modelIndex(index: number) {
    if (index > this.options.models.length - 1) {
      index = 0;
    }
    this._modelIndex = index;
    this.stage.modelIndex = index;
    this.models.modelIndex = index;
    setModelIndex(index);
  }

  get modelIndex(): number {
    return this._modelIndex;
  }

  private set modelClothesIndex(index: number) {
    this._modelClothesIndex = index;
    this.models.modelClothesIndex = index;
    setModelClothesIndex(index);
  }

  get modelClothesIndex(): number {
    return this._modelClothesIndex;
  }
  /**
   * 显示模型的 hit area 区域
   */
  showModelHitAreaFrames() {
    this.models.removeHitAreaFrames();
  }

  /**
   * 隐藏模型的 hit area 区域
   */
  hideModelHitAreaFrames() {
    this.models.addHitAreaFrames();
  }

  /**
   * 设置模型缩放比例
   */
  setModelScale(scale: number) {
    this.models.setScale(scale);
  }

  /**
   * 设置模型表情
   * @param name 表情名称
   */
  setExpression(name: string): void {
    this.models.setExpression(name);
  }

  /**
   * 设置静默模式 (不显示状态条和提示框)
   */
  setSilent(silent: boolean): void {
    this.isTransitioning = silent;
    if (silent) {
      this.isFirstLoad = false;
      this.pendingReload = false;
    } else if (this.pendingReload) {
      this.pendingReload = false;
      void this.reloadModel();
    }
    this.statusBar.setSilent(silent);
    this.tips.setSilent(silent);
  }

  /**
   * 重新挂载
   * @param parentElement
   */
  reMount(parentElement?: HTMLElement): void {
    if (parentElement) {
      this.options.parentElement = parentElement;
    }

    console.log('[OML2D] reMount called', {
      hasParent: !!parentElement,
      stageParentMatch: this.stage.element?.parentElement === parentElement,
      stageConnected: this.stage.element?.isConnected
    });

    if (parentElement && this.stage.element?.parentElement === parentElement && this.stage.element?.isConnected) {
      console.log('[OML2D] reMount: already mounted and connected, skipping destructive operations');
      this.globalStyle.mount(parentElement);
      this.statusBar.reMount();

      return;
    }

    console.log('[OML2D] reMount: performing full re-mount');
    this.setSilent(true);

    // 重新挂载前清除所有正在显示的提示
    this.tips.clear();
    this.statusBar.clearEvents();

    this.globalStyle.mount(parentElement);
    this.stage.reMount(parentElement);
    this.statusBar.reMount();

    // 增加锁定时长，确保覆盖动画重置的时间 (1000ms 动画 + 500ms 缓冲)
    setTimeout(() => {
      this.setSilent(false);
    }, 1500);
  }

  stopTipsIdle() {
    this.tips.idlePlayer?.stop();
  }

  startTipsIdle() {
    this.tips.idlePlayer?.start();
  }
  statusBarPopup(content?: string | undefined, delay?: number | undefined, color?: string | undefined) {
    if (this.isTransitioning) {
      return;
    }
    this.statusBar.popup(content, delay, color);
  }

  setStatusBarHoverEvent(events?: { onIn?: () => void | Promise<void>; onOut?: () => void | Promise<void> }) {
    this.statusBar.setHoverEvent(events);
  }

  tipsMessage(message: string, duration: number, priority: number) {
    if (this.isTransitioning) {
      return;
    }
    this.tips.notification(message, duration, priority);
  }

  setStageStyle(style: CommonStyleType) {
    this.stage.setStyle(handleCommonStyle(style));
  }

  setModelPosition(position: { x?: number | undefined; y?: number | undefined }) {
    const { x = 0, y = 0 } = position;

    this.models.setPosition(x, y);
  }

  /**
   * 移动端是否隐藏
   */
  private get mobileHidden(): boolean {
    return !this.options.mobileDisplay && getWindowSizeType() === WindowSizeType.mobile;
  }

  /**
   * 创建
   */
  private create(): void {
    // this.store.updateModelInfo(this.options.models);

    this.stage.create();

    this.pixiApp = new PixiApp(this.stage);

    this.statusBar.create();

    this.statusBar.initializeStyle();
  }

  /**
   * 挂载
   */
  private mount(): void {
    this.stage.mount();
    this.statusBar.mount();
  }

  /**
   * 加载模型
   */
  private async loadModel(): Promise<void> {
    if (this.isTransitioning) {
      this.pendingReload = true;

      return;
    }
    this.pendingReload = false;
    this.tips.clear();
    await this.stage.slideOut();

    if (!this.options.models || !this.options.models.length) {
      return;
    }

    if (this.mobileHidden) {
      this.statusBar.rest();

      return;
    }

    this.statusBar.showLoading();

    return this.models
      .create()
      .catch(() => {
        this.statusBar.loadingError(() => void this.reloadModel());
        this.events.emit('load', 'fail');
      })
      .then(() => {
        this.pixiApp?.mount(this.models.model);
        this.menus.reload(this.stage.element!);
        this.tips.reload(this.stage.element!);

        this.models.settingModel();
        this.stage.reloadStyle(this.models.modelSize);
        this.pixiApp?.resize();
        if (!this.isTransitioning) {
          this.statusBar.hideLoading();
        }
        this.events.emit('load', 'success');
      });
  }

  /**
   * 重新加载
   */
  async reloadModel(): Promise<void> {
    await this.loadModel();
    if (this.isTransitioning) {
      return;
    }
    await this.stage.slideIn();
    this.tips.idlePlayer?.start();
  }

  /**
   * 随机加载模型
   */
  async loadRandomModel(): Promise<void> {
    this.modelIndex = getRandomIndex(this.options.models.length, this.modelIndex);
    this.modelClothesIndex = 0;

    this.statusBar.open(this.options.statusBar.switchingMessage);
    await this.loadModel();
    if (this.isTransitioning) {
      return;
    }
    await this.stage.slideIn();
    void this.tips.idlePlayer?.start();
  }

  /**
   * 加载下个角色模型
   */
  async loadNextModel(): Promise<void> {
    if (++this.modelIndex >= this.options.models.length) {
      this.modelIndex = 0;
    }
    this.modelClothesIndex = 0;

    this.statusBar.open(this.options.statusBar.switchingMessage);

    await this.loadModel();
    if (this.isTransitioning) {
      return;
    }
    await this.stage.slideIn();
    void this.tips.idlePlayer?.start();
  }

  /**
   * 通过模型索引值加载模型
   */
  async loadModelByIndex(index: number, clothesIndex?: number): Promise<void> {
    if (index >= 0 && index < this.options.models.length) {
      this.modelIndex = index;
      this.modelClothesIndex = clothesIndex || 0;

      this.statusBar.open(this.options.statusBar.switchingMessage);

      await this.loadModel();
      if (this.isTransitioning) {
        return;
      }
      await this.stage.slideIn();
      void this.tips.idlePlayer?.start();
    }
  }

  /**
   * 通过模型名称加载模型
   */
  async loadModelByName(name: string, clothesIndex?: number) {
    const targetIndex = this.options.models.findIndex((item) => item.name === name);

    await this.loadModelByIndex(targetIndex, clothesIndex);
  }

  async loadNextModelClothes(): Promise<void> {
    const path = this.options.models[this.modelIndex].path;

    if (isArray(this.options.models[this.modelIndex].path) && this.options.models.length) {
      if (++this.modelClothesIndex >= path.length) {
        this.modelClothesIndex = 0;
      }
      await this.loadModel();
      await this.stage.slideIn();
    } else {
      this.tips.notification('该模型没有其他衣服~', 5000, 3);
    }
  }

  /**
   * 设置当前模型的旋转角度
   * @param rotation
   */
  setModelRotation(rotation: number): void {
    this.models.setRotation(rotation);
  }

  /**
   * 设置当前模型的锚点位置
   * @param anchor
   */
  setModelAnchor(anchor: { x?: number; y?: number }): void {
    const { x, y } = anchor;

    this.models.setAnchor(x, y);
  }

  // 初始化
  private initialize(): void {
    // 检查版本
    void checkVersion();

    // 打印信息
    if (this.options.sayHello) {
      printProjectInfo();
    }

    this.registerGlobalEvent();

    this.globalStyle.initialize(this.options.parentElement);

    //  创建舞台和状态条
    this.create();

    //  挂载舞台和状态条
    this.mount();

    // 加载模型
    void this.loadModel().then(() => {
      const status = getStatus() || this.options.initialStatus;

      if (!getStatus()) {
        setStatus(this.options.initialStatus);
      }

      if (status === 'sleep') {
        this.tips.clear();

        this.statusBar.open(this.options.statusBar.restMessage);

        this.statusBar.setClickEvent(() => {
          this.stage.slideIn();
          this.tips.idlePlayer?.start();
          this.statusBar.close();
          this.statusBar.clearHoverEvent();
          this.statusBar.clearClickEvent();
        });
      } else {
        this.stage.slideIn();
      }
    });
  }

  /**
   * 舞台滑入
   */
  async stageSlideIn(): Promise<void> {
    await this.stage.slideIn();
  }

  /**
   * 舞台滑出
   */
  async stageSlideOut(): Promise<void> {
    await this.stage.slideOut();
  }

  /**
   * 休息/睡眠
   */
  sleep(): void {
    this.statusBar.open(this.options.statusBar.restMessage);
    this.tips.clear();
    this.statusBar.setClickEvent(() => {
      void this.stage.slideIn();
      this.statusBar.close();
      this.statusBar.clearClickEvent();
      this.statusBar.clearHoverEvent();
    });
    void this.stage.slideOut();
  }

  /**
   * 弹出状态条并保持打开状态
   * @param content
   * @param color
   */
  statusBarOpen(content?: string, color?: string): void {
    if (this.isTransitioning) {
      return;
    }
    this.statusBar.open(content, color);
  }

  /**
   * 清除当前提示框内容并关闭空闲消息播放器
   */
  clearTips(): void {
    this.tips.clear();
  }
  /**
   * 设置状态条点击事件
   * @param fn
   */
  setStatusBarClickEvent(fn: EventFn): void {
    this.statusBar.setClickEvent(fn);
  }

  /**
   * 收起状态条
   * @param content
   * @param color
   * @param delay
   */
  statusBarClose(content?: string, delay?: number, color?: string): void {
    if (this.isTransitioning) {
      return;
    }
    this.statusBar.close(content, color, delay);
  }
  /**
   * 清除状态条所有绑定事件
   */
  statusBarClearEvents(): void {
    this.statusBar.clearClickEvent();
    this.statusBar.clearHoverEvent();
  }
  /**
   * 舞台滑入动画执行完毕后的事件监听
   * @param fn
   */
  onStageSlideIn(fn: EventFn): void {
    this.events.add('stageSlideIn', fn);
  }

  /**
   * 舞台滑出动画执行完毕后的事件监听
   * @param fn
   */
  onStageSlideOut(fn: EventFn): void {
    this.events.add('stageSlideOut', fn);
  }

  /**
   * 模型在每次加载状态发生变化时的事件监听
   * @param fn
   */
  onLoad(fn: LoadEventFn): void {
    this.events.add('load', fn);
  }

  /**
   * 注册全局事件
   */
  private registerGlobalEvent(): void {
    onChangeWindowSize(() => {
      void this.reloadModel();
    });

    this.onStageSlideIn(() => {
      if (this.isFirstLoad && !this.isTransitioning) {
        this.tips.welcome();
        this.isFirstLoad = false;
      }
    });

    window.document.oncopy = (): void => {
      this.tips.copy();
    };
  }
}
