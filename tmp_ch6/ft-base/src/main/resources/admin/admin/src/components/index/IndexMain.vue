<template>
	<div class="layout">
		<index-aside></index-aside>
		<div class="layout-main">
			<index-header class="layout-header"></index-header>
			<bread-crumbs :title="title" class="layout-breadcrumb"></bread-crumbs>
			<div class="layout-content" ref="content">
				<router-view class="router-view"></router-view>
			</div>
		</div>
	</div>
</template>

<script>
	import IndexAside from '@/components/index/IndexAsideStatic'
	import IndexHeader from '@/components/index/IndexHeader'
	import menu from "@/utils/menu";
	export default {
		components: {
			IndexAside,
			IndexHeader
		},
		data() {
			return {
				menuList: [],
				role: "",
				title: '',
			};
		},
		watch: {
			$route() {
				this.resetScroll();
			}
		},
		mounted() {
			let menus = menu.list();
			this.menuList = menus;
			this.role = this.$storage.get("role");

			// 监听内容区子节点变化，列表页切换详情时重置滚动
			this._observer = new MutationObserver(() => {
				this.resetScroll();
			});
			this.$nextTick(() => {
				if (this.$refs.content) {
					this._observer.observe(this.$refs.content, { childList: true, subtree: true });
				}
			});
		},
		beforeDestroy() {
			if (this._observer) this._observer.disconnect();
		},
		methods: {
			menuHandler(menu) {
				this.$router.push({ name: menu.tableName });
				this.title = menu.menu;
			},
			resetScroll() {
				this.$nextTick(() => {
					if (this.$refs.content) this.$refs.content.scrollTop = 0;
				});
			}
		}
	};
</script>

<style lang="scss" scoped>
	.layout {
		display: flex;
		min-height: 100vh;
		background: #FFF8F0;
	}

	.layout-main {
		flex: 1;
		margin-left: 210px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	.layout-header {
		flex-shrink: 0;
		z-index: 100;
	}

	.layout-breadcrumb {
		flex-shrink: 0;
		background: #FFF8F0;
		z-index: 99;
	}

	.layout-content {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.router-view {
		min-height: 100%;
		background: transparent;
	}
</style>
