<template>
	<div class="sidebar">
		<div class="sidebar-logo">
			<i class="el-icon-food logo-icon"></i>
			<span class="logo-text">食光集</span>
		</div>

		<el-scrollbar wrap-class="scrollbar-wrapper">
			<el-menu
				:default-openeds="defaultOpens"
				:unique-opened="true"
				:default-active="activeMenu"
				class="sidebar-menu"
				background-color="#fff"
				text-color="#5A4A3A"
				active-text-color="#FF6B35"
			>
				<!-- 首页 -->
				<el-menu-item index="home" @click="menuHandler('')">
					<i class="el-icon-s-home"></i>
					<span>系统首页</span>
				</el-menu-item>

				<!-- 个人中心 -->
				<el-submenu index="profile">
					<template slot="title">
						<i class="el-icon-user-solid"></i>
						<span>个人中心</span>
					</template>
					<el-menu-item index="updatePassword" @click="menuHandler('updatePassword')">修改密码</el-menu-item>
					<el-menu-item index="center" @click="menuHandler('center')">个人信息</el-menu-item>
				</el-submenu>

				<!-- 动态菜单 -->
				<el-submenu
					v-for="(menu, index) in menuList.backMenu"
					:key="menu.menu"
					:index="'menu-' + index"
				>
					<template slot="title">
						<i :class="icons[index]"></i>
						<span>{{ menu.menu }}</span>
					</template>
					<el-menu-item
						v-for="(child, sort) in menu.child"
						:key="sort"
						:index="child.tableName"
						@click="menuHandler(child.tableName)"
					>{{ child.menu }}</el-menu-item>
				</el-submenu>
			</el-menu>
		</el-scrollbar>
	</div>
</template>

<script>
import menu from '@/utils/menu'
export default {
	data() {
		return {
			menuList: [],
			dynamicMenuRoutes: [],
			role: '',
			icons: [
				'el-icon-s-cooperation',
				'el-icon-s-order',
				'el-icon-s-platform',
				'el-icon-s-fold',
				'el-icon-s-unfold',
				'el-icon-s-operation',
				'el-icon-s-promotion',
				'el-icon-s-release',
				'el-icon-s-ticket',
				'el-icon-s-management',
				'el-icon-s-open',
				'el-icon-s-shop',
				'el-icon-s-marketing',
				'el-icon-s-flag',
				'el-icon-s-comment',
				'el-icon-s-finance',
				'el-icon-s-claim',
				'el-icon-s-custom',
				'el-icon-s-opportunity',
				'el-icon-s-data',
				'el-icon-s-check',
				'el-icon-s-grid',
				'el-icon-menu',
				'el-icon-chat-dot-square',
				'el-icon-message',
				'el-icon-postcard',
				'el-icon-position',
				'el-icon-microphone',
				'el-icon-close-notification',
				'el-icon-bangzhu',
				'el-icon-time',
				'el-icon-odometer',
				'el-icon-crop',
				'el-icon-aim',
				'el-icon-switch-button',
				'el-icon-full-screen',
				'el-icon-copy-document',
				'el-icon-mic',
				'el-icon-stopwatch',
			],
		}
	},
	computed: {
		activeMenu() {
			const path = this.$route.path;
			if (path === '/' || path === '/index' || path === '/index/') return 'home';
			if (path === '/updatePassword') return 'updatePassword';
			if (path === '/center') return 'center';
			const seg = path.replace(/^\/+/, '').split('/')[0];
			return seg || 'home';
		},
		defaultOpens() {
			// 自动展开包含当前激活菜单的子菜单
			const path = this.$route.path;
			if (path === '/updatePassword' || path === '/center') return ['profile'];
			const seg = path.replace(/^\/+/, '').split('/')[0];
			if (!seg || seg === 'index') return [];
			const menus = this.menuList.backMenu || [];
			for (let i = 0; i < menus.length; i++) {
				const children = menus[i].child || [];
				for (let j = 0; j < children.length; j++) {
					if (children[j].tableName === seg) return ['menu-' + i];
				}
			}
			return [];
		}
	},
	mounted() {
		const menus = menu.list()
		if (menus) {
			this.menuList = menus
		} else {
			this.$http({
				url: "menu/list",
				method: "get",
				params: { page: 1, limit: 1, sort: 'id' }
			}).then(({ data }) => {
				if (data && data.code === 0) {
					this.menuList = JSON.parse(data.data.list[0].menujson);
					this.$storage.set("menus", this.menuList);
				}
			})
		}
		this.role = this.$storage.get('role')
		for (let i = 0; i < this.menuList.length; i++) {
			if (this.menuList[i].roleName == this.role) {
				this.menuList = this.menuList[i];
				break;
			}
		}
	},
	methods: {
		menuHandler(name) {
			this.$router.push('/' + name)
		},
	}
}
</script>

<style lang="scss" scoped>
.sidebar {
	width: 210px;
	height: 100vh;
	position: fixed;
	top: 0;
	left: 0;
	background: #fff;
	border-right: 1px solid #f0e6de;
	display: flex;
	flex-direction: column;
	z-index: 1001;

	.sidebar-logo {
		height: 56px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 20px;
		border-bottom: 1px solid #f0e6de;
		flex-shrink: 0;

		.logo-icon {
			font-size: 22px;
			color: #FF6B35;
		}

		.logo-text {
			font-size: 16px;
			font-weight: 700;
			color: #FF6B35;
		}
	}

	.el-scrollbar {
		flex: 1;
		overflow: hidden;
	}

	.sidebar-menu {
		border-right: none;
		padding: 8px 0;

		::v-deep .el-menu-item,
		::v-deep .el-submenu__title {
			height: 44px;
			line-height: 44px;
			font-size: 14px;
			padding: 0 20px !important;
			margin: 2px 8px;
			border-radius: 6px;

			i {
				color: #B0A09A;
				margin-right: 8px;
				font-size: 16px;
				width: 16px;
				text-align: center;
			}

			&:hover {
				background: rgba(255, 107, 53, 0.06) !important;

				i {
					color: #FF6B35;
				}
			}
		}

		::v-deep .el-menu-item.is-active {
			background: rgba(255, 107, 53, 0.1) !important;
			color: #FF6B35;
			font-weight: 500;

			i {
				color: #FF6B35;
			}
		}

		::v-deep .el-submenu .el-menu-item {
			min-width: auto;
			padding-left: 48px !important;
			height: 40px;
			line-height: 40px;
			font-size: 13px;
		}

		::v-deep .el-submenu__icon-arrow {
			font-size: 12px;
			color: #c0c4cc;
		}

		::v-deep .el-submenu.is-opened > .el-submenu__title {
			color: #303133;
		}
	}
}

::v-deep .scrollbar-wrapper {
	overflow-x: hidden !important;
}

::v-deep .el-scrollbar__bar.is-horizontal {
	display: none;
}
</style>
