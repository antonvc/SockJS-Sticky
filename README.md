# SockJS-Sticky
This demo shows how to achieve session stickiness for SockJS on AWS. 
The stickiness is based on source IP and doesn't require any special configuration of the SockJS client.

The demo is based on the SockJS example app [Echo](https://github.com/sockjs/sockjs-node/tree/main/examples/echo)

The full architecture uses:
- [EKS](https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html)
- [AWS Loadbalancer Controller](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html)
- [NLB](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html) (AWS Network Loadbalancer)

## Behind the scenes
The network loadbalancer gets deployed automatically when the service is deployed onto the kubernetes cluster by the AWS Loadbalancer controller. The loadbalancer will be continuously updated with new targets/pods when new pods are created/destroyed. This works because the cluster uses the VPC CNI and every pod will get routable IP inside the VPC. The NLB has been annotated to keep the sessions sticky based on source IP ```service.beta.kubernetes.io/aws-load-balancer-target-group-attributes: stickiness.enabled=true,stickiness.type=source_ip```

> Note: Deploying this sample application to your AWS account will incure charges.
> Note: This is not production ready code, please use at your own risk and in a non-production account!

## Getting started
Before deploying the sample you first need to download and install the this repository by running to following commands.

```sh
git clone https://github.com/antonvc/SockJS-Sticky.git
cd SockJS-Sticky
npm install
```

The Docker images for this application are build locally before storing them in Amazon ECR. For this reason you need to be able to build Docker container, for instance with [Docker Desktop](https://www.docker.com/products/docker-desktop).

## Deployment
This code sample is using [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/home.html) and [cdk8s](https://cdk8s.io/) for deploying the infrastructure and application.

### deply the infrastructure
```sh
npm run deploy
```

This will create a Kubernetes cluster using Amazon EKS using fargate as compute layer, it also installs the AWS Loadbalancer Controller and the Echo SockJS server (using ck8s).
> Note:For this example it doesn't matter if you use AWS Fargate or EC2 nodes.

### accessing the demo
At the end of deploying the infrastructure and apps (±30min) you will see the command to add the cluster context to kubectl, add the context and switch to it (or add the context flag in the kubectl commands below)

Now you can get the loadbalancer address (EXTERNAL-IP)
```
kubectl get service
> NAME                      TYPE           CLUSTER-IP      EXTERNAL-IP                                                                       PORT(S)        AGE
> kubernetes                ClusterIP      172.20.0.1      <none>                                                                            443/TCP        15m
> sockjs-service-c864b2b0   LoadBalancer   172.20.238.96   k8s-default-sockjsse-xxx-xxx.elb.eu-central-1.amazonaws.com                       80:30506/TCP   4m42s

```

## project structure
- `app` folder contains the Echo SockJS App and Dockerfile
- `lib/sockjs-sticky-cdk-stack.ts` contains the CDK code to deploy the instrastructure and also the cdk8s code to deploy the application in the k8s cluster. 

## Architecture
![Architecture](app/architecture.png)

## Cleanup
When you're finished you can run `npm run destroy` to cleanup and remove all infrastructure that was used for this demo.
