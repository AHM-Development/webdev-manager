FROM httpd:alpine

# Enable the modules nginx had built in (commented out by default in this image)
RUN sed -i \
    -e 's|^#\(LoadModule proxy_module .*\)|\1|' \
    -e 's|^#\(LoadModule proxy_http_module .*\)|\1|' \
    -e 's|^#\(LoadModule proxy_wstunnel_module .*\)|\1|' \
    -e 's|^#\(LoadModule rewrite_module .*\)|\1|' \
    conf/httpd.conf \
 && echo 'ServerName localhost' >> conf/httpd.conf \
 && echo 'Include conf/extra/vhost.conf' >> conf/httpd.conf

COPY vhost.conf conf/extra/vhost.conf
