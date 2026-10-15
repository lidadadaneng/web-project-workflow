<template>
	<div class="breadcrumb-bar">
		<el-breadcrumb separator="/">
			<el-breadcrumb-item v-for="(item, index) in levelList" :key="item.path">
				<span v-if="item.redirect === 'noRedirect' || index == levelList.length - 1" class="no-redirect">{{ item.name }}</span>
				<a v-else @click.prevent="handleLink(item)">{{ item.name }}</a>
			</el-breadcrumb-item>
		</el-breadcrumb>
	</div>
</template>

<script>
import pathToRegexp from 'path-to-regexp'
import { generateTitle } from '@/utils/i18n'
export default {
	data() {
		return {
			levelList: null
		}
	},
	watch: {
		$route() {
			this.getBreadcrumb()
		}
	},
	created() {
		this.getBreadcrumb()
	},
	methods: {
		generateTitle,
		getBreadcrumb() {
			let route = this.$route
			let matched = route.matched.filter(item => item.meta)
			matched = [{ path: '/index' }].concat(matched)
			this.levelList = matched.filter(item => item.meta)
		},
		handleLink(item) {
			const { redirect, path } = item
			if (redirect) {
				this.$router.push(redirect)
				return
			}
			this.$router.push(path)
		},
	}
}
</script>

<style lang="scss" scoped>
	.breadcrumb-bar {
		padding: 16px 24px;
		background: transparent;

		.el-breadcrumb {
			font-size: 13px;
			line-height: 1;

			::v-deep .el-breadcrumb__separator {
				color: #d0c4bc;
				margin: 0 6px;
			}

			::v-deep .el-breadcrumb__inner a {
				color: #B0A09A;
				font-weight: normal;
				transition: color 0.2s;

				&:hover {
					color: #FF6B35;
				}
			}

			::v-deep .el-breadcrumb__inner {
				color: #8A7A6A;
				font-weight: normal;
			}

			.no-redirect {
				color: #5A4A3A;
				font-weight: 500;
			}
		}
	}
</style>
