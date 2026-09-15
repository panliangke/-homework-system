# 作业提交系统 - 容器镜像
# 适用于 Koyeb / Sealos 等支持 Dockerfile 部署的平台
# 仅使用 Python 标准库，无第三方依赖
FROM python:3.12-slim

WORKDIR /app

# 拷贝应用代码
COPY . .

# Koyeb 默认通过 8080 端口访问；Sealos 部署时手动填写同一端口
ENV PORT=8080
EXPOSE 8080

# 关闭 stdout 缓冲，保证平台日志实时可见
ENV PYTHONUNBUFFERED=1

CMD ["python", "webapp.py"]
