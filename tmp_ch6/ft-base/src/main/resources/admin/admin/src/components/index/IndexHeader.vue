<template>
	<div class="header-bar">
		<div class="header-left">
			<i class="el-icon-s-home header-icon" @click="$router.push('/')"></i>
			<span class="header-title">{{ $project.projectName }}</span>
		</div>
		<div class="header-right">
			<div class="header-user" @click="$router.push('/center')">
				<i class="el-icon-user-solid"></i>
				<span>{{ user.username || $storage.get('adminName') }}</span>
			</div>
			<div class="header-divider"></div>
			<div class="header-logout" @click="onLogout">
				<i class="el-icon-switch-button"></i>
				<span>退出</span>
			</div>
		</div>
	</div>
</template>

<script>
	export default {
		data() {
			return {
				user: {},
			};
		},
		mounted() {
			let sessionTable = this.$storage.get("sessionTable")
			this.$http({
				url: sessionTable + '/session',
				method: "get"
			}).then(({ data }) => {
				if (data && data.code === 0) {
					this.user = data.data;
					this.$storage.set('userid', data.data.id);
				}
			});
		},
		methods: {
			onLogout() {
				this.$storage.clear()
				this.$router.replace({ name: "login" });
			},
		}
	};
</script>

<style lang="scss" scoped>
	.header-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 56px;
		padding: 0 24px;
		background: #fff;
		border-bottom: 1px solid #f0e6de;

		.header-left {
			display: flex;
			align-items: center;
			gap: 10px;

			.header-icon {
				font-size: 20px;
				color: #FF6B35;
				cursor: pointer;
				padding: 4px;
				border-radius: 6px;
				transition: background 0.2s;

				&:hover {
					background: rgba(255, 107, 53, 0.08);
				}
			}

			.header-title {
				font-size: 16px;
				font-weight: 600;
				color: #303133;
				letter-spacing: 0.5px;
			}
		}

		.header-right {
			display: flex;
			align-items: center;
			gap: 0;

			.header-user {
				display: flex;
				align-items: center;
				gap: 6px;
				padding: 6px 12px;
				border-radius: 6px;
				cursor: pointer;
				transition: background 0.2s;
				color: #606266;
				font-size: 13px;

				i {
					font-size: 16px;
					color: #FF6B35;
				}

				&:hover {
					background: rgba(255, 107, 53, 0.06);
				}
			}

			.header-divider {
				width: 1px;
				height: 20px;
				background: #f0e6de;
				margin: 0 8px;
			}

			.header-logout {
				display: flex;
				align-items: center;
				gap: 6px;
				padding: 6px 12px;
				border-radius: 6px;
				cursor: pointer;
				transition: background 0.2s;
				color: #909399;
				font-size: 13px;

				i {
					font-size: 15px;
				}

				&:hover {
					background: rgba(245, 108, 108, 0.06);
					color: #F56C6C;
				}
			}
		}
	}
</style>
