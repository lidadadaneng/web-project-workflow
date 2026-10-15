const base = {
    get() {
        return {
            url : "http://localhost:8080/springboot7tr93/",
            name: "springboot7tr93",
            // 退出到首页链接
            indexUrl: 'http://localhost:8080/springboot7tr93/front/h5/index.html'
        };
    },
    getProjectName(){
        return {
            projectName: "食光集 · 美食管理系统"
        } 
    }
}
export default base
