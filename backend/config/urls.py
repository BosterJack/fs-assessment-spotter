from django.urls import path
from django.template import TemplateDoesNotExist
from django.template.loader import get_template
from django.views.generic import TemplateView
from routing import views


def index(request):
    # The standalone API image has no React build; the combined image still does.
    try:
        get_template("index.html")
    except TemplateDoesNotExist:
        return views.health(request)
    return TemplateView.as_view(template_name="index.html")(request)


urlpatterns = [
    path("api/health/", views.health),
    path("api/places/", views.places),
    path("api/plan/", views.plan),
    path("api/corridor/", views.corridor),
    path("", index),
]
